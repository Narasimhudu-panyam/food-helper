import importlib.util
from pathlib import Path


def test_alembic_initial_migration_syntax():
    """Verify initial migration file exists and can be imported cleanly."""
    migration_file = Path("d:/Food Helper/backend/alembic/versions/0001_initial_schema.py")
    assert migration_file.exists()

    spec = importlib.util.spec_from_file_location("migration_0001", migration_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "0001_initial_schema"
    assert module.down_revision is None
    assert hasattr(module, "upgrade")
    assert hasattr(module, "downgrade")
