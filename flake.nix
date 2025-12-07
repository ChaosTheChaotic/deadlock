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
	    docker-compose
	    postgresql
	    cargo
          ];
	  shellHook = ''
	      echo "Node: $(node --version)"
	      echo "pnpm: $(pnpm --version)"
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
	  '';
        };
      });
}
