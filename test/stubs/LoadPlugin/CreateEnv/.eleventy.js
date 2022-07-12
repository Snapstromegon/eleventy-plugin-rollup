const rollupPlugin = require("../../../../");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(rollupPlugin, {
    rollupOptions: {
      output: {
        format: "es",
        dir: "_site/js",
      },
    },
  });
};
