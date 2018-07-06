const sinon = require("sinon");
const chai = require("chai");
const axios = require("axios");
const AWS = require("aws-sdk-mock");

chai.use(require("chai-as-promised"));
chai.use(require("sinon-chai"));
const should = chai.should();

const config = require("../index");
const configSample = require("./fixtures/config");
const configValues = require("./fixtures/config-values");
const configResults = require("./fixtures/config-results");

describe("config", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    AWS.restore();
  });
  it("exists", () => {
    config.should.be.a("function");
  });
  it("throws an error when NODE_ENV is not defined", () => {
    process.env.NODE_ENV = "";
    (() => config.get()).should.throw("NODE_ENV must be supplied");
  });
  it("throws an error when params is empty", () => {
    (() => config.get([])).should.throw("params must not be empty");
  });
  it("returns a promise", () => {
    config.get(["blah"]).should.be.an.instanceof(Promise);
  });
  it("fails promise when error", () => {
    AWS.mock("SSM", "getParameters", (params, cb) => {
      cb(new Error("some AWS error"));
    });

    return config.get(["mysql.host"]).should.eventually.be.rejectedWith("some AWS error");
  });
  it("fails promise when there are any invalid parameters returned", () => {
    AWS.mock("SSM", "getParameters", (params, cb) => {
      cb(null, { InvalidParameters: ["some-invalid-param"] });
    });

    return config
      .get(["mysql.host"])
      .should.eventually.be.rejectedWith("Error: Invalid requested params");
  });
  it("throws an error when params is empty", () => {
    (() => config.getByPath()).should.throw("params must not be empty");
  });
  it("returns a promise", () => {
    config.getByPath("/blah").should.be.an.instanceof(Promise);
  });
  it("fails promise when error", () => {
    AWS.mock("SSM", "getParametersByPath", (params, cb) => {
      cb(new Error("some AWS error"));
    });

    return config.getByPath("/dev").should.eventually.be.rejectedWith("some AWS error");
  });
  it("fails promise when there are any invalid parameters returned", () => {
    AWS.mock("SSM", "getParametersByPath", (params, cb) => {
      cb(null, { InvalidParameters: ["some-invalid-param"] });
    });

    return config
      .getByPath("/dev")
      .should.eventually.be.rejectedWith("Error: Invalid requested params");
  });

  describe("fetching values", () => {
    let spy;
    beforeEach(() => {
      spy = sinon.spy((params, cb) => {
        cb(null, { Parameters: [{ Name: "/test/mysql.host", Value: "some-host" }] });
      });

      AWS.mock("SSM", "getParameters", spy);
    });
    afterEach(() => {
      AWS.restore();
    });
    it("returns with values when provided an array", () => {
      let params = ["mysql.host"];
      return config.get(params).then(function(values) {
        values.should.include({ "mysql.host": "some-host" });
      });
    });
    it("does not modify the original array contents", () => {
      let params = ["mysql.host"];
      return config.get(params).then(function(values) {
        params.should.contain("mysql.host");
        params.should.have.length(1);
      });
    });
    it("returns with values when provided a string", () => {
      return config.get("mysql.host").then(function(values) {
        values.should.include({ "mysql.host": "some-host" });
      });
    });
    it("returns with cached values when requested", () => {
      return config.get("mysql.host").then(() =>
        config.get("mysql.host", true).then(() => {
          spy.callCount.should.equal(1);
        })
      );
    });
    it("returns with fresh values by default", () => {
      return config.get("mysql.host").then(() =>
        config.get("mysql.host").then(() => {
          spy.callCount.should.equal(2);
        })
      );
    });
  });

  describe("fetching values by path", () => {
    afterEach(() => {
      AWS.restore();
    });

    it("returns with values when provided a string", () => {
      const stub = sinon.stub();

      stub.onFirstCall().callsFake((params, cb) => {
        cb(null, {
          Parameters: [{ Name: "/test/mysql.host", Value: "some-host" }],
          NextToken: "abc"
        });
      });

      stub.onSecondCall().callsFake((params, cb) => {
        cb(null, {
          Parameters: [{ Name: "/test/mysql.user", Value: "some-user" }]
        });
      });

      AWS.mock("SSM", "getParametersByPath", stub);

      return config.getByPath("/test").then(values => {
        values.should.include({ "mysql.host": "some-host", "mysql.user": "some-user" });
      });
    });
  });

  describe("fetching templated values", () => {
    beforeEach(() => {
      AWS.mock("SSM", "getParameters", (params, cb) => {
        cb(null, { Parameters: [{ Name: "/test/path/to/ssm", Value: "blah" }] });
      });
    });
    afterEach(() => {
      AWS.restore();
    });
    it("returns with values when provided an object", () => {
      return config.get({ "mysql.host": "path/to/ssm" }).then(function(values) {
        values.should.include({ "mysql.host": "blah" });
      });
    });
    it("returns with values when provided a deep object", () => {
      return config.get({ mysql: { host: "path/to/ssm" } }).then(function(values) {
        values.should.deep.equal({ mysql: { host: "blah" } });
      });
    });
    it("ignores non-string non-object values", () => {
      return config.get({ blah: 3, mysql: { host: "path/to/ssm" } }).then(values => {
        should.not.exist(values.blah);
        Object.keys(values).length.should.equal(2);
      });
    });
  });

  describe("handles config with more than 10 parameters", () => {
    beforeEach(() => {
      AWS.mock("SSM", "getParameters", (params, cb) => {
        // mocks the response with the appropriate results from the config-results file
        const Parameters = params.Names.reduce((result, param) => {
          result.push({ Name: param, Value: configValues[param] });
          return result;
        }, []);

        cb(null, { Parameters });
      });
    });
    afterEach(() => {
      AWS.restore();
    });

    it("returns with values when provided a deep object that has more than 10 params", () => {
      return config.get(configSample).then(function(values) {
        values.should.deep.equal(configResults);
      });
    });
  });

  describe("when environment is local", () => {
    let axiosStub = null;
    beforeEach(() => {
      process.env.NODE_ENV = "local";
      axiosStub = sinon.stub(axios, "get");
    });
    afterEach(() => {
      axiosStub.restore();
    });
    it("makes an http request instead", () => {
      let mockResponse = { data: { whatever: "hi" } };
      axiosStub.resolves(mockResponse);
      return config.get("whatever").then(res => {
        axiosStub.should.have.been.calledOnce;
        res.should.deep.equal(mockResponse.data);
      });
    });
  });
});
