import subprocess
import sys
import uuid


def run(cmd: list[str]) -> int:
    print("+ " + " ".join(cmd), flush=True)
    return subprocess.call(cmd)


def main() -> int:
    project = f"pwtest_{uuid.uuid4().hex}"
    base = ["docker", "compose", "-f", "docker-compose.test.yml", "-p", project]

    exit_code = 1
    try:
        exit_code = run(base + ["up", "--build", "--exit-code-from", "tests", "--remove-orphans"])
        return exit_code
    finally:
        # Всегда чистим окружение (контейнеры/сеть/volumes проекта), даже если тесты упали.
        run(base + ["down", "-v", "--remove-orphans"])


if __name__ == "__main__":
    raise SystemExit(main())

