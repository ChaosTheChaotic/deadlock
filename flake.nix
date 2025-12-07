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
            echo "To start PostgreSQL: docker-compose up -d"
            echo "To stop PostgreSQL: docker-compose down"
            echo "To connect via CLI: psql -h localhost -U postgres -d postgres"
            echo "To connect to UIDB: psql -h localhost -U postgres -d UIDB"
            echo "To connect to GRIDS: psql -h localhost -U postgres -d GRIDS"
            echo "With app user: psql -h localhost -U app_user -d UIDB"
          '';
        };
      });
}
