{
  description = "A Vite React TypeScript application: deadlock";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
	    nodejs
            pnpm
            typescript-language-server
            prettier
	    eslint
	    napi-rs-cli
	    docker
	    docker-compose
	    rootlesskit
	    postgresql
	    rustup
          ];
          shellHook = ''
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo ""
            echo "--- Docker Rootless Setup ---"
            
            # Set up rootless Docker environment
            export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
            export PATH=$HOME/bin:$PATH
            
            # Check if dockerd-rootless is already running
            if [ ! -S "$XDG_RUNTIME_DIR/docker.sock" ]; then
              echo "Starting dockerd-rootless in the background..."
              
              # Create necessary directories
              mkdir -p $HOME/.local/share/docker
              
              # Start dockerd-rootless in background and save PID
              dockerd-rootless --experimental --storage-driver overlay2 &
              DOCKERD_PID=$!
              
              # Wait for Docker socket to be created
              echo "Waiting for Docker socket..."
              for i in {1..30}; do
                if [ -S "$XDG_RUNTIME_DIR/docker.sock" ]; then
                  echo "Docker socket created successfully"
                  break
                fi
                sleep 1
              done
              
              # Store PID for cleanup
              echo $DOCKERD_PID > /tmp/dockerd-rootless.pid
              
              # Set up trap to kill dockerd-rootless on shell exit
              cleanup_docker() {
                echo "Cleaning up dockerd-rootless..."
                if [ -f /tmp/dockerd-rootless.pid ]; then
                  kill $(cat /tmp/dockerd-rootless.pid) 2>/dev/null || true
                  rm -f /tmp/dockerd-rootless.pid
                fi
              }
              trap cleanup_docker EXIT
            else
              echo "Docker socket already exists at $XDG_RUNTIME_DIR/docker.sock"
              echo "Using existing dockerd-rootless instance"
            fi
            
            # Test Docker connection
            echo -n "Testing Docker connection... "
            if docker info >/dev/null 2>&1; then
              echo "OK"
              echo "Docker version: $(docker --version)"
            else
              echo "FAILED"
              echo "Warning: Docker may not be ready yet"
            fi

	    echo "--- Rustup setup ---"
	    rustup default stable
	    echo "--- Rustup setup complete ---"
            
            echo ""
            echo "--- Database Options ---"
            echo "Option 1: Use the local PostgreSQL installed in this shell."
            echo "  Start: pg_ctl start -l /tmp/postgres.log"
            echo "  Stop : pg_ctl stop"
            echo ""
            echo "Option 2: Use Docker (recommended for isolation)."
            echo "  Start: docker-compose up -d"
            echo "  Stop : docker-compose down"
            echo ""
            echo "--- Application ---"
            echo "Web frontend (./web):"
            echo "  Dev server: pnpm run dev"
            echo "  Build     : pnpm run build"
            echo ""
            echo "Backend server (./serv):"
            echo "  Check its package.json for available scripts."
            echo ""
            echo "--- Notes ---"
            echo "- dockerd-rootless is running in background (PID: $DOCKERD_PID)"
            echo "- It will be automatically stopped when you exit this shell"
            echo "- Docker socket: $DOCKER_HOST"
          '';
        };
      });
}
