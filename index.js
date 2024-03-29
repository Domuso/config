const {
  SSMClient,
  GetParametersByPathCommand,
  GetParametersCommand
} = require("@aws-sdk/client-ssm");

var cache = {};

var getAllKeys = object => {
  var keys = [];
  Object.keys(object).forEach(key => {
    if (typeof object[key] === "string") keys.push(object[key]);
    else if (typeof object[key] === "object") keys = keys.concat(getAllKeys(object[key]));
  });
  return keys;
};

var populateValues = (template, values) => {
  var output = {};
  Object.keys(template).forEach(key => {
    output[key] =
      typeof template[key] === "object"
        ? populateValues(template[key], values)
        : values[template[key]];
  });
  return output;
};

// returns with cached object if all keys are present in the cache
// else returns null
var retrieveCache = params => {
  var cachedResult = {};
  for (var i = 0; i < params.length; i++) {
    if (!cache[params[i]]) return null;

    cachedResult[params[i]] = cache[params[i]];
  }
  return Promise.resolve(cachedResult);
};
/**
  Accepts a number of input params and returns with an promise of the requested config values

  String  config.get('host')                          {host: 'value1'}
  Array   config.get(['host','username'])             {host: 'value1',username: 'value2'}
  Object  config.get({host: {name: 'ssm/path'}})      {host: {name: 'value'}}
 **/
let getConfigs = (request, useCache = true) => {
  var ssm = new SSMClient({ region: "us-east-1" });
  var outputTemplate = null;
  if (!process.env.NODE_ENV)
    throw new Error("NODE_ENV must be supplied as an environment variable");
  if (process.env.NODE_ENV === "local") {
    let axios = require("axios"); // only bundle in devDependencies
    return axios.get(`http://localhost:${exports.localPort}`).then(res => res.data);
  }
  if (!Array.isArray(request) && typeof request === "object") {
    outputTemplate = request;
    request = getAllKeys(request);
  }
  if (typeof request === "string") request = [request];
  if (!request.length) throw new Error("params must not be empty");
  let params = [].concat(request); // create a new copy

  var result = useCache && retrieveCache(request);
  if (!result) {
    // chunk the params into 10 due to SSM limitation with getParameters
    const chunkSize = 10;
    let chunkedParams = [params.splice(0, chunkSize)];
    while (params.length > 0) {
      chunkedParams.push(params.splice(0, chunkSize));
    }
    result = Promise.all(
      chunkedParams.map(chunkedParam => {
        const options = {
          Names: chunkedParam.map(param => `/${process.env.NODE_ENV}/${param}`),
          WithDecryption: true
        };
        const getParameters = new GetParametersCommand(options);
        return ssm.send(getParameters).then(data => {
          if (data.InvalidParameters && data.InvalidParameters.length > 0) {
            const errorMsg = `Invalid requested params ${data.InvalidParameters}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
          var output = {};
          var values = data.Parameters.reduce((prev, param) => {
            var normalizedKey = param.Name.substring(process.env.NODE_ENV.length + 2); // strip the leading / as well
            prev[normalizedKey] = param.Value;
            return prev;
          }, output);

          Object.assign(cache, values); // save to cache
          return values;
        });
      })
    ).then(chunkedResults => chunkedResults.reduce((prev, curr) => Object.assign(prev, curr), {}));
  }
  return result.then(values => {
    var output = values;
    if (outputTemplate) {
      output = populateValues(outputTemplate, values);
    }
    return output;
  });
};

var _getConfigsByPath = (ssm, path, results = {}, token) => {
  if (!path) throw new Error("params must not be empty");
  const getParametersByPath = new GetParametersByPathCommand({
    Path: path,
    NextToken: token,
    Recursive: true,
    WithDecryption: true
  });
  return ssm.send(getParametersByPath).then(data => {
    if (data.InvalidParameters && data.InvalidParameters.length > 0) {
      const errorMsg = `Invalid requested params ${data.InvalidParameters}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    data.Parameters.forEach(param => {
      var normalizedName = param.Name.substring(path.length + 1); // strip trailing / as well;
      results[normalizedName] = param.Value;
    });
    return data.NextToken
      ? _getConfigsByPath(ssm, path, results, data.NextToken)
      : Promise.resolve(results);
  });
};

var getConfigsByPath = path => {
  var ssm = new SSMClient({ region: "us-east-1" });
  return _getConfigsByPath(ssm, path);
};

module.exports = getConfigs;
module.exports.get = getConfigs; // alternative descriptive api and useful for mocking purposes
module.exports.getByPath = getConfigsByPath;
module.exports.localPort = 10641;
