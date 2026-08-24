# prettier-plugin-wesl

A Prettier 3 plugin for stable WESL syntax. It registers the `wesl` parser for
`*.wesl` files.

> [!WARNING]
> This AI-generated slop exists mainly to support development of my own
> projects. It is a temporary stopgap to fill the void in WESL tooling until
> something better comes along, and this repository may vanish at any time.

## Installation

```sh
npm install --save-dev github:ludwigbrida/prettier-plugin-wesl
```

Then add the plugin to `prettier.config.ts`:

```ts
import type { Config } from "prettier";

const config: Config = {
  plugins: ["prettier-plugin-wesl"],
};

export default config;
```

Run `prettier --write "**/*.wesl"` as usual.

To update the GitHub-installed plugin after new commits are available, run:

```sh
npm update prettier-plugin-wesl
```

The consuming project's lockfile resolves `main` to a specific commit, so a
normal `npm install` does not fetch newer commits automatically.

## Scope

The plugin supports only stable WESL syntax, including imports, visibility
modifiers, and conditional translation attributes. Experimental extensions such
as generics, const injection, and virtual modules are not supported.

## License

This software is provided under the [MIT license](./LICENSE.md).
