#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../index");

const DEFAULT_TEMPLATE_PATH = "./config.json";
const DEFAULT_OUTPUT_PATH = "./src/config.js";

let outputPath;
let templatePath;

process.argv.forEach(arg => {
  const [k, v] = arg.split("=");
  if (k === "output") {
    outputPath = v;
  }
  if (k === "template") {
    templatePath = v;
  }
});

const showWarning = !outputPath || !templatePath;

templatePath = path.join(process.cwd(), templatePath || DEFAULT_TEMPLATE_PATH);
outputPath = path.join(process.cwd(), outputPath || DEFAULT_OUTPUT_PATH);

if (showWarning) {
  console.warn(`\x1b[34mtemplatePath and OutputPath we're not passed. Using default values:\
    \n\nTemplatePath: ${templatePath}\n\nOutputPath: ${outputPath} \
    \n\nYou can also use the following format: \x1b[33mbuilder template=<path> output=<path>\x1b[0m\n`);
}

console.log("\x1b[32mSTARTING TO BUILD CONFIG FILE\x1b[0m\n");
const configTmpl = require(templatePath);

console.log("Getting Config from SSM");
config.get(configTmpl).then(cfg => {
  console.log("Successfully got SSM config");

  function writeFile() {
    console.log(`Writing to ${outputPath}`);
    fs.writeFileSync(outputPath, "module.exports =" + JSON.stringify(cfg)); // { flag: "w" } => default. overwrites. { flag: "wx" } => don't overwrite
    console.log("Done Building config");
  }

  let shouldWrite = true;
  if (fs.existsSync(outputPath)) {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return readline.question(
      `\x1b[41mConfig file already exists. Overwrite (y/n)?\x1b[0m `,
      answer => {
        if (!["yes", "y"].includes(answer.toLowerCase())) {
          console.log("Skipping config creation");
          shouldWrite = false;
        }

        if (shouldWrite) {
          writeFile();
        }

        readline.close();
      }
    );
  } else {
    writeFile();
  }
});
