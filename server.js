const express = require("express");
const bodyParser = require("body-parser");

const defaultPort = 10641;

let response = null;
let app = null;
let server = null;
module.exports.start = done => {
  response = {};
  if (app) {
    console.log(`Already listening to port ${defaultPort}`);
    return done([app, server]);
  }
  app = express();
  app.get("/", (req, res) => {
    console.log("received request", response);
    res.send(response);
  });
  app.post("/", bodyParser.json({ type: "application/*" }), (req, res) => {
    console.log(`Received ${req.body}`);
    Object.assign(response, req.body);
    res.send(response);
  });
  server = app.listen(defaultPort, () => {
    console.log(`Listening on port ${defaultPort}`);
    done([app, server]);
  });
};
