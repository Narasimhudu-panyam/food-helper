"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { tokenStorage } from "@/lib/auth/token-storage";
import { useToast } from "@/components/ui/toast";
import { Notification, WebSocketNotificationMessage } from "@/types";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 30000;

export function useNotificationSocket() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const { info } = useToast();

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearTimers();
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      if (
        socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING
      ) {
        socketRef.current.close(1000, "Client disconnect");
      }
      socketRef.current = null;
    }
    isConnectingRef.current = false;
  }, [clearTimers]);

  const handleNotificationReceived = useCallback(
    (notification: Notification) => {
      // 1. Invalidate core notification queries
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });

      // 2. Safely invalidate related domain queries based on entity metadata
      if (notification.related_entity_type === "match") {
        queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
        queryClient.invalidateQueries({ queryKey: ["match"] });
        queryClient.invalidateQueries({ queryKey: ["donation-offers"] });
      } else if (notification.related_entity_type === "pickup") {
        queryClient.invalidateQueries({ queryKey: ["pickups"] });
        queryClient.invalidateQueries({ queryKey: ["pickup"] });
      } else if (notification.related_entity_type === "donation") {
        queryClient.invalidateQueries({ queryKey: ["donations"] });
        queryClient.invalidateQueries({ queryKey: ["donation"] });
      } else if (notification.related_entity_type === "organization") {
        queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
      }

      // 3. Show a lightweight, clean toast
      if (notification.title && notification.message) {
        info(notification.message, notification.title);
      }
    },
    [queryClient, info]
  );

  const connect = useCallback(() => {
    if (!isAuthenticated || typeof window === "undefined") {
      return;
    }

    const token = tokenStorage.getAccessToken();
    if (!token) {
      return;
    }

    // Prevent duplicate active/connecting sockets
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;

    try {
      // Determine WebSocket URL from explicit NEXT_PUBLIC_WS_URL or derive from NEXT_PUBLIC_API_URL
      const explicitWsUrl = process.env.NEXT_PUBLIC_WS_URL;
      let wsUrl: string;
      if (explicitWsUrl) {
        const separator = explicitWsUrl.includes("?") ? "&" : "?";
        wsUrl = `${explicitWsUrl}${separator}token=${encodeURIComponent(token)}`;
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        let wsBase = apiUrl
          .replace(/^http:\/\//i, "ws://")
          .replace(/^https:\/\//i, "wss://");
        
        // Ensure trailing /api/v1 is properly handled
        if (!wsBase.includes("/api/v1")) {
          wsBase = `${wsBase.replace(/\/+$/, "")}/api/v1`;
        }
        wsUrl = `${wsBase}/notifications/ws?token=${encodeURIComponent(token)}`;
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;

        // Setup keep-alive ping interval
        clearTimers();
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        try {
          if (event.data === "pong") {
            return;
          }

          const parsed: WebSocketNotificationMessage = JSON.parse(event.data);
          if (parsed && parsed.type === "notification" && parsed.notification) {
            handleNotificationReceived(parsed.notification);
          }
        } catch (parseErr) {
          console.warn("Failed to parse incoming WebSocket message payload:", parseErr);
        }
      };

      socket.onclose = (event) => {
        isConnectingRef.current = false;
        socketRef.current = null;
        clearTimers();

        // If not closed cleanly (code 1000) and user is still logged in, attempt bounded reconnection
        if (
          event.code !== 1000 &&
          event.code !== 1008 && // Policy violation / auth failure: do not reconnect blindly
          isAuthenticated &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const attempt = reconnectAttemptsRef.current + 1;
          reconnectAttemptsRef.current = attempt;
          const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            BASE_RECONNECT_DELAY_MS * Math.pow(1.5, attempt - 1)
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      socket.onerror = () => {
        isConnectingRef.current = false;
        // WebSocket error will naturally trigger onclose for reconnection handling
      };
    } catch (err) {
      isConnectingRef.current = false;
      console.warn("Could not establish real-time notification socket:", err);
    }
  }, [isAuthenticated, clearTimers, handleNotificationReceived]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      closeSocket();
    }

    return () => {
      closeSocket();
    };
  }, [isAuthenticated, user?.id, connect, closeSocket]);

  return {
    isConnected: socketRef.current?.readyState === WebSocket.OPEN,
  };
}
