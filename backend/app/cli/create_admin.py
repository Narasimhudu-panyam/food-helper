import argparse
import asyncio
import getpass
import os
import sys

from app.core.database import AsyncSessionLocal
from app.services.admin_provision_service import AdminProvisionService


async def provision_admin_entrypoint(email: str, password: str, promote: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        try:
            admin_user, created = await AdminProvisionService.provision_admin(
                db=session,
                email=email,
                password=password,
                promote_existing=promote,
            )
            if created:
                print("\n[SUCCESS] Admin User configured successfully.")
            else:
                print("\n[INFO] Admin User already exists (idempotent - no changes made).")

            print(f"User ID: {admin_user.id}")
            print(f"Email:   {admin_user.email}")
            print(f"Role:    {admin_user.role.value}")
            print(f"Active:  {admin_user.is_active}")
            print(f"Verified:{admin_user.is_verified}")
        except Exception as e:
            print(f"\n[ERROR] Failed to provision admin user: {e}", file=sys.stderr)
            sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Provision the initial Food Helper Administrator account securely."
    )
    parser.add_argument(
        "--email",
        type=str,
        default=os.getenv("ADMIN_EMAIL"),
        help="Admin email address (or set ADMIN_EMAIL env var)",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=os.getenv("ADMIN_PASSWORD"),
        help="Admin password (or set ADMIN_PASSWORD env var)",
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        default=os.getenv("ADMIN_PROMOTE", "").lower() in ("1", "true", "yes"),
        help="Promote an existing user to ADMIN role",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    email = args.email
    password = args.password

    # Interactive prompts if not supplied via arguments or environment variables
    if not email:
        try:
            email = input("Enter admin email: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.", file=sys.stderr)
            sys.exit(1)

    if not password:
        try:
            password = getpass.getpass("Enter admin password: ")
            password_confirm = getpass.getpass("Confirm admin password: ")
            if password != password_confirm:
                print("\n[ERROR] Passwords do not match.", file=sys.stderr)
                sys.exit(1)
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.", file=sys.stderr)
            sys.exit(1)

    try:
        asyncio.run(provision_admin_entrypoint(email=email, password=password, promote=args.promote))
    except KeyboardInterrupt:
        print("\nAborted.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
