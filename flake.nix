{
  description = "terminal_dogma dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
  in {
    devShells.${system}.default = pkgs.mkShell {
      packages = [
        pkgs.nodejs_24
        pkgs.python3
        (pkgs.texlive.combine {
          inherit (pkgs.texlive) scheme-small standalone pgf amsmath amsfonts dvisvgm;
        })
      ];
    };
  };
}
