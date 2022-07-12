const test = require("ava");
const Eleventy = require("@11ty/eleventy");
test("Create Env", async (t) => {
  const elev = new Eleventy(
    "./test/stubs/LoadPlugin/CreateEnv",
    "./test/stubs/_site",
    { configPath: "./test/stubs/LoadPlugin/CreateEnv/.eleventy.js" }
  );
  const output = await elev.toJSON();
  console.log(output);
  t.pass();
});
