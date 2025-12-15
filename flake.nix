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
            if ! docker version >/dev/null 2>&1; then
              echo "Starting dockerd-rootless in the background..."
              
              # Start dockerd-rootless in a proper subprocess
              # Using nohup and setsid to properly detach the process
              setsid nohup dockerd-rootless \
                --experimental \
                --storage-driver overlay2 \
                > $HOME/.docker-rootless.log 2>&1 &
              
              # Wait for Docker socket to be created
              echo "Waiting for Docker socket..."
              for i in {1..30}; do
                if [ -S "$XDG_RUNTIME_DIR/docker.sock" ]; then
                  echo "Docker socket created successfully"
                  break
                fi
                sleep 1
              done
            else
              echo "Docker is already running"
            fi
            
            # Test Docker connection
            echo -n "Testing Docker connection... "
            if docker info >/dev/null 2>&1; then
              echo "OK"
              echo "Docker version: $(docker --version)"
              DOCKER_PID=$(ps aux | grep dockerd-rootless | grep -v grep | head -1 | awk '{print $2}')
              echo "Docker daemon PID: $DOCKER_PID"
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
            echo "- Docker socket: $DOCKER_HOST"
            echo "- To stop Docker daemon when done:"
            echo "  pkill -f dockerd-rootless"
            echo "- Docker logs: $HOME/.docker-rootless.log"
            
            # Cleanup function that runs when the shell exits
            cleanup() {
              echo "Cleaning up..."
              # Only kill Docker if we started it in this session
              if [ -n "$DOCKER_PID" ]; then
                echo "Stopping Docker daemon..."
                kill $DOCKER_PID 2>/dev/null || true
              fi
            }
            
            # Set up trap to run cleanup on shell exit
            trap cleanup EXIT
            
            # Ignore Ctrl+C in this shell, let zsh handle it
            trap \'\' INT
            
            echo ""
            echo "Press Ctrl+D to exit this shell and stop Docker"
            echo "Press Ctrl+C to interrupt foreground processes in zsh"
          '';
        };
      });
}
