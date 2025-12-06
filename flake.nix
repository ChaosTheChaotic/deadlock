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
          ];
        };
      });
}
