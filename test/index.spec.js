const sinon = require("sinon");
const chai = require("chai");
const axios = require("axios");
const rewire = require("rewire");

const { mockClient } = require("aws-sdk-client-mock");
const {
  SSMClient,
  GetParametersByPathCommand,
  GetParametersCommand
} = require("@aws-sdk/client-ssm");

chai.use(require("chai-as-promised"));
chai.use(require("sinon-chai"));
const should = chai.should();

const config = rewire("../index");
const configSample = require("./fixtures/config");
const configValues = require("./fixtures/config-values");
const configResults = require("./fixtures/config-results");

describe("config", () => {
  let resetCache;
  let ssmMock;
  before(() => {
    ssmMock = mockClient(SSMClient);
  });
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    resetCache = config.__set__("cache", {});
  });
  afterEach(() => {
    ssmMock.reset();
    resetCache();
  });
  after(() => {
    ssmMock.restore();
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
  it("fails promise when error", () => {
    ssmMock.on(GetParametersCommand).rejects(new Error("some AWS error"));
    return config.get(["mysql.host"]).should.eventually.be.rejectedWith("some AWS error");
  });
  it("fails promise when there are any invalid parameters returned", () => {
    ssmMock.on(GetParametersCommand).resolves({ InvalidParameters: ["some-invalid-param"] });
    return config
      .get(["mysql.host"])
      .should.eventually.be.rejectedWith("Error: Invalid requested params");
  });
  it("throws an error when params is empty", () => {
    (() => config.getByPath()).should.throw("params must not be empty");
  });

  it("fails promise when error", () => {
    ssmMock.on(GetParametersByPathCommand).rejects(new Error("some AWS error"));
    return config.getByPath("/dev").should.eventually.be.rejectedWith("some AWS error");
  });
  it("fails promise when there are any invalid parameters returned", () => {
    ssmMock.on(GetParametersByPathCommand).resolves({ InvalidParameters: ["some-invalid-param"] });

    return config
      .getByPath("/dev")
      .should.eventually.be.rejectedWith("Error: Invalid requested params");
  });

  describe("fetching values", () => {
    beforeEach(() => {
      ssmMock
        .on(GetParametersCommand)
        .resolves({ Parameters: [{ Name: "/test/mysql.host", Value: "some-host" }] });
    });

    it("returns a promise", () => {
      config.get(["blah"]).should.be.an.instanceof(Promise);
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
    it("returns with cached values by default", () => {
      return config.get("mysql.host").then(() =>
        config.get("mysql.host").then(() => {
          ssmMock.send.callCount.should.equal(1);
        })
      );
    });
    it("returns with fresh values when requested", () => {
      return config.get("mysql.host").then(() =>
        config.get("mysql.host", false).then(() => {
          ssmMock.send.callCount.should.equal(2);
        })
      );
    });
  });

  describe("fetching values by path", () => {
    it("returns a promise", () => {
      ssmMock.on(GetParametersByPathCommand).resolves();
      config.getByPath("/blah").should.be.an.instanceof(Promise);
    });

    it("returns with values when provided a string", () => {
      ssmMock.send.onFirstCall().resolves({
        Parameters: [{ Name: "/test/mysql.host", Value: "some-host" }],
        NextToken: "abc"
      });
      ssmMock.send.onSecondCall().resolves({
        Parameters: [{ Name: "/test/mysql.user", Value: "some-user" }]
      });

      return config.getByPath("/test").then(values => {
        values.should.include({ "mysql.host": "some-host", "mysql.user": "some-user" });
      });
    });
  });

  describe("fetching templated values", () => {
    beforeEach(() => {
      ssmMock
        .on(GetParametersCommand)
        .resolves({ Parameters: [{ Name: "/test/path/to/ssm", Value: "blah" }] });
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
      ssmMock.on(GetParametersCommand).callsFake(params => {
        // mocks the response with the appropriate results from the config-results file
        const Parameters = params.Names.reduce((result, param) => {
          result.push({ Name: param, Value: configValues[param] });
          return result;
        }, []);

        return Promise.resolve({ Parameters });
      });
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
