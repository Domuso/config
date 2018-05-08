#!/usr/bin/env node
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const defaultPort = 10641;

const args = process.argv.splice(process.execArgv.length + 2);

let response = {};
const app = express();
app.get("/", (req, res) => {
  console.log("received request", response);
  res.send(response);
});
app.post("/", bodyParser.json({ type: "application/*" }), (req, res) => {
  console.log(req.body);
  Object.assign(response, req.body);
  res.send(JSON.stringify(response, null, 2));
});
app.listen(defaultPort, () => console.log(`Listening on port ${defaultPort}`));
