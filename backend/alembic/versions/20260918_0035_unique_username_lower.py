"""Add case-insensitive unique index on users.username

Revision ID: 20260918_0035
Revises: 20260717_0034
Create Date: 2026-09-18 14:00:00.000000
"""

from alembic import op


revision = "20260918_0035"
down_revision = "20260717_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Resolve duplicate usernames (case-insensitive) before adding the unique index.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                user_id,
                username,
                ROW_NUMBER() OVER (
                    PARTITION BY lower(username)
                    ORDER BY created_at ASC, user_id ASC
                ) AS rn
            FROM users
            WHERE username IS NOT NULL AND btrim(username) <> ''
        )
        UPDATE users AS u
        SET username = NULL
        FROM ranked AS r
        WHERE u.user_id = r.user_id
          AND r.rn > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
        ON users (lower(username))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_username_lower")
