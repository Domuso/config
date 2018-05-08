const request = require("supertest");
const server = require("../server");
const should = require("chai").should();

describe("server", () => {
  let app = null;
  let http = null;
  beforeEach(done => {
    server.start(res => {
      [app, http] = res;
      done();
    });
  });
  afterEach(done => {
    if (!http.listening) return done();
    http.close(done);
  });
  it("start exists", () => {
    should.exist(server.start);
    server.start.should.be.a("function");
  });
  it("does not restart the app if already started", done => {
    let secondApp = server.start(res => {
      let [secondApp] = res;
      secondApp.should.equal(app);
      done();
    });
  });
  describe("#get", () => {
    it("exists", () => {
      return request(app)
        .get("/")
        .expect(200);
    });
    it("initializes with empty object", () => {
      return request(app)
        .get("/")
        .expect(res => res.body.should.deep.equal({}))
        .expect(200);
    });
  });
  describe("#post", () => {
    it("exists", () => {
      return request(app)
        .post("/")
        .send({})
        .expect(200);
    });
    it("uploads configurations to the server", () => {
      return request(app)
        .post("/")
        .send({ some: "config" })
        .expect(res => {
          res.body.should.deep.equal({ some: "config" });
        });
    });
    it("merges existing configurations to the server", () => {
      return request(app)
        .post("/")
        .send({ merged: "value", old: "untouched" })
        .then(res => {
          return request(app)
            .post("/")
            .send({ merged: "new value", new: "value" })
            .then(res => {
              res.body.should.deep.equal({ merged: "new value", new: "value", old: "untouched" });
            });
        });
    });
  });
});
