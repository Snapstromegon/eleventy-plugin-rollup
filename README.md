# Eleventy-Plugin-Rollup

Provide an integrated way to use rollup with eleventy.

This is based on my original [blogpost about 11ty and rollup](https://www.hoeser.dev/blog/2021-02-28-11ty-and-rollup/).

The benefit of this plugin is, that the resulting page will only load the JS it needs and parts of your bundle can be shared between pages.
This is, because rollup and 11ty no longer run independently from each other, but rollup knows what happens in 11ty.

## Installation

```
npm i -D eleventy-plugin-rollup rollup
```

## Usage

### Adding the plugin

#### With explicit config

```js
const rollupPlugin = require('eleventy-plugin-rollup');

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(rollupper, {
    rollupOptions: {
      output: {
        format: 'es',
        dir: '_site/js',
      },
    },
  });

  // ...
};
```

#### With existing config

```js
const rollupPlugin = require('eleventy-plugin-rollup');

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(rollupper, {
    rollupOptions: 'rollup.config.js',
  });

  // ...
};
```

### Usage in templates

```liquid
{% rollup "assets/js/some.js" | url %}
```

### Possible options

| Name            | Default                                                 | Description                                                                                                              |
| :-------------- | :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| shortcode       | rollup                                                  | Rollup Plugin shortcode name to use in templates (async shortcode required!)                                             |
| rollupOptions   | -                                                       | Your rollup config (either a valid rollup config option or a file path to a rollup config - can only include one config) |
| resolveName     | _default name with hash_                                | Lets you overwrite how the resulting bundles are called.                                                                 |
| scriptGenerator | file => `<script src="${file}" type="module"></script>` | Defines how the resulting script tag from the shortcode should work                                                      |

## Known limitations

### No Default Config

You have to provide some kind of rollup config, since there is no default provided at the moment

### No multiple bundles in rollup config

You can't define multiple bundles/configurations inside your rollup config, since we wouldn't know which one to use as the plugin.
But you can definetely use multiple instances of the plugin.
