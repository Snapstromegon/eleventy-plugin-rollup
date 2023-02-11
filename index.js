const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * @typedef {Object} RollupPluginConfig
 * @property {string} [shortcode="rollup"]
 * @property {import("rollup").RollupOptions | string} rollupOptions
 * @property {function(string):Promise<string>} resolveName
 * @property {function(string):Promise<string>} scriptGenerator
 * @property {string} [importScriptsAbsoluteFrom=eleventyConfig.dir.output] Path to use for absolute imports in the generated script. If falsy, the script will use the eleventy output directory.
 * @property {boolean} [useAbsoluteScriptPaths=false] If true, the script will use absolute paths for the generated script. If false, the script will use relative paths.
 */

/**
 * @typedef {import('@11ty/eleventy/src/UserConfig')} EleventyConfig
 * @typedef {import('@11ty/eleventy/src/Eleventy')} Eleventy
 */

// If a file is used in multiple bundles, chunking might fail
let filesAcrossAllBundles = new Map();

/**
 * Create an instance for a Rollup Plugin.
 * Be aware that the config is not allowed to be an array of bundles yet - sorry.
 * @param {EleventyConfig} eleventyConfig Config to use
 * @param {RollupPluginConfig} options
 */
module.exports = (eleventyConfig, options) => {
  new EleventyPluginRollup(eleventyConfig, options);
};

class EleventyPluginRollup {
  inputFiles = {};
  rollupConfigPromise;
  rollupConfig;
  resolveName;
  scriptGenerator;

  /**
   * Create a new instance of the rollup plugin
   * @param {EleventyConfig} eleventyConfig
   * @param {RollupPluginConfig} options Configuration for the plugin instance
   */
  constructor(
    eleventyConfig,
    {
      shortcode = 'rollup',
      resolveName = this.defaultNamingFunction,
      scriptGenerator = this.defaultScriptGenerator,
      rollupOptions,
      importScriptsAbsoluteFrom,
      useAbsoluteScriptPaths,
    }
  ) {
    this.importScriptsAbsoluteFrom =
      importScriptsAbsoluteFrom || eleventyConfig.dir.output;
    this.useAbsoluteScriptPaths = useAbsoluteScriptPaths;
    this.rollupConfigPromise = this.loadRollupConfig(
      rollupOptions,
      eleventyConfig
    );
    this.resolveName = resolveName;
    this.scriptGenerator = scriptGenerator;
    eleventyConfig.on('beforeBuild', () => this.beforeBuild());
    eleventyConfig.on('afterBuild', () => this.afterBuild());

    // We want to use "this" in the callback function, so we save the class instance beforehand
    const thisRollupPlugin = this;
    eleventyConfig.addAsyncShortcode(shortcode, function (...args) {
      return thisRollupPlugin.rollupperShortcode(this, ...args);
    });
  }

  /**
   * Load the config including resolving file names to files
   * @param {import("rollup").RollupOptions | string} potentialConfig
   * @returns {Promise<import("rollup").RollupOptions>} Resolved config
   */
  async loadRollupConfig(potentialConfig, eleventyConfig) {
    let config;
    if (typeof potentialConfig === 'string') {
      // Load from file
      const configModule = await import(
        path.resolve(process.cwd(), potentialConfig)
      );
      const configOrConfigResolver = configModule.default;
      if (typeof configOrConfigResolver === 'function') {
        config = configOrConfigResolver({});
      } else {
        config = configOrConfigResolver;
      }
    } else {
      config = potentialConfig;
    }

    this.rollupConfig = config;

    if (this.rollupConfig.watch && this.rollupConfig.watch.include) {
      let includes = [];
      if (this.rollupConfig.watch.include[Symbol.iterator]) {
        includes = this.rollupConfig.watch.include;
      } else {
        includes = [this.rollupConfig.watch.include];
      }

      for (const watchInclude of includes) {
        eleventyConfig.addWatchTarget(watchInclude);
      }
    }

    return config;
  }

  /**
   * Resolve a file to a unique, cacheable filename
   * @param {string} resolvedPath Original path of the file
   * @returns {string} Unique name
   */
  async defaultNamingFunction(resolvedPath) {
    const fileHash = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      // Include file path in hash to handle moved files
      hash.update(resolvedPath);
      hash.update('---MAGIC ELEVENTY ROLLUP PLUGIN DEVIDER---');
      const input = fs.createReadStream(resolvedPath);
      input.on('error', reject);
      input.on('data', (chunk) => hash.update(chunk));
      input.on('close', () => resolve(hash.digest('hex')));
    });
    // keep original filename in output filename
    const parsedPath = path.parse(resolvedPath);
    return `${parsedPath.name}-${fileHash.substr(0, 6)}.js`;
  }

  /**
   * Reset the current instance of the plugin.
   * This is needed when the build does a hot/watch reload.
   */
  beforeBuild() {
    this.inputFiles = {};
    filesAcrossAllBundles = new Map();
  }

  /**
   *
   * @param {Eleventy} eleventyInstance Currently executing 11ty instance
   * @param {string} src Path to JS file
   * @param {boolean} [isFileRelative=false] Should the file resolve relative to the current template?
   * @returns
   */
  async rollupperShortcode(eleventyInstance, src, isFileRelative = false) {
    // Return early if page is not rendered to filesystem to avoid errors and remove unnecessary files from bundle.
    if (eleventyInstance.page.outputPath === false) {
      return;
    }

    await this.rollupConfigPromise;
    // Resolve to the correct relative location
    if (isFileRelative) {
      src = path.resolve(path.dirname(eleventyInstance.page.inputPath), src);
    }

    // resolve to absolute, since rollup uses absolute paths
    src = path.resolve(src);
    src = path.relative('.', src);

    if (
      filesAcrossAllBundles.has(src) &&
      filesAcrossAllBundles.get(src) !== this
    ) {
      console.warn(
        `eleventy-plugin-rollup warning: ${src} is used in multiple bundles, this might lead to unwanted sideeffects!`
      );
    }
    filesAcrossAllBundles.set(src, this);

    // resolveName is potentially very expensive, so avoid unnecessary executions of it
    // -> this plugin assumes that every js file is stable during a build
    if (!(src in this.inputFiles)) {
      const scriptSrc = await this.resolveName(src);
      // register for rollup bundling
      this.inputFiles[src] = scriptSrc;
    }

    const relativeFrom = this.useAbsoluteScriptPaths
      ? this.importScriptsAbsoluteFrom
      : path.dirname(eleventyInstance.page.outputPath);

    // calculate script src after bundling
    const importPath = path
      .join(
        this.useAbsoluteScriptPaths ? '/' : '.',
        path.relative(
          relativeFrom,
          path.join(this.rollupConfig.output.dir, this.inputFiles[src])
        )
      )
      .replaceAll('\\', '/');

    return this.scriptGenerator(importPath, eleventyInstance);
  }

  defaultScriptGenerator(filePath, eleventyInstance) {
    return `<script src="${filePath}" type="module"></script>`;
  }

  /**
   * Calculates the inputs for Rollup
   *
   * This handles combining possible preexisting input configs with the ones generated by this plugin
   *
   * @returns {string[]} List of inputs
   */
  async getRollupInputs() {
    await this.rollupConfigPromise;
    const pluginInputs = Object.keys(this.inputFiles);
    // No other inputs defined
    if (!('input' in this.rollupConfig)) {
      return pluginInputs;
    }

    // Input is simple array
    if (Array.isArray(this.rollupConfig.input)) {
      return [...this.rollupConfig.input, ...pluginInputs];
    }
    // Input is the complex object form
    if (typeof this.rollupConfig.input === 'object') {
      const res = {};
      Object.assign(res, this.rollupConfig.input);
      for (const entry of pluginInputs) {
        res[entry] = entry;
      }
      return res;
    }
    // Input is just a single string
    return [this.rollupConfig.input, ...pluginInputs];
  }

  /**
   * After the "normal" eleventy build is done, we need to start the compile step of rollup.
   * At this point we know all dependencies and can start building.
   */
  async afterBuild() {
    // If we run in serverless, we don't want to write to the filesystem
    if (process.env.ELEVENTY_SERVERLESS) {
      return;
    }

    await this.rollupConfigPromise;
    // Return early if no JS was used, since rollup throws on empty inputs
    if (!Object.keys(this.inputFiles).length) {
      return;
    }

    // Overwrite the rollup input argument to contain the shortcode entrypoints
    const input = await this.getRollupInputs();
    // We import here, because we don't need rollup anywhere else and it shouldn't
    // load in serverless environments.
    const rollup = require('rollup');
    const bundle = await rollup.rollup({
      input,
      ...this.rollupConfig,
    });
    await bundle.write({
      entryFileNames: (chunk) => {
        const src = path.relative('.', chunk.facadeModuleId);
        return this.inputFiles[src];
      },
      ...this.rollupConfig.output,
    });
    await bundle.close();
  }
}
