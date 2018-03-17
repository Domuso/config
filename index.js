var logger = require('domuso-logs').getLogger('domuso-configs');
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'})

var cache = {}

var getAllKeys = (object) => {
  var keys = []
  Object.keys(object).forEach((key) => {
    if (typeof object[key] === 'string') keys.push(object[key])
    else if (typeof object[key] === 'object')
      keys = keys.concat(getAllKeys(object[key]))
  })
  return keys
}

var populateValues = (template, values) => {
  var output = {}
  Object.keys(template).forEach((key) => {
    output[key] = (typeof template[key] === 'object') ? populateValues(template[key], values) : values[template[key]]
  })
  return output;
}

// returns with cached object if all keys are present in the cache
// else returns null
var retrieveCache = (params) => {
  var cachedResult = {}
  for (var i = 0; i < params.length; i++){
    if (!cache[params[i]]) return null
    
    cachedResult[params[i]] = cache[params[i]]
  }
  return Promise.resolve(cachedResult)
}

/**
  Accepts a number of input params and returns with an promise of the requested config values
  
  String  config.get('host')                          {host: 'value1'}
  Array   config.get(['host','username'])             {host: 'value1',username: 'value2'} 
  Object  config.get({host: {name: 'ssm/path'}})      {host: {name: 'value'}}
 **/
 
module.exports = (params, cache = false) => {
  var ssm = new AWS.SSM();
  var outputTemplate = null
  if (!process.env.NODE_ENV) throw new Error('NODE_ENV must be supplied as an environment variable')
  if (!Array.isArray(params) && typeof params === 'object'){
    outputTemplate = params
    params = getAllKeys(params)
  }
  if (typeof params === 'string') params = [params]
  if (!params.length) throw new Error('params must not be empty')

  logger.log('Retrieving params: ', params)
  
  var result = cache && retrieveCache(params)
  if (!result){
    // chunk the params into 10 due to SSM limitation with getParameters
    const chunkSize = 10;
    let chunkedParams = [params.splice(0, chunkSize)];
    while (params.length > chunkSize){
      chunkedParams.push(params.splice(0, chunkSize))
    }
    result = Promise.all(chunkedParams.map(chunkedParam => {
      var options = {
        Names: chunkedParams.map(param => `/${process.env.NODE_ENV}/${param}`),
        WithDecryption: true,
      }
      let blah = ssm.getParameters(options).promise()
      return blah.then(data => {
        if (data.InvalidParameters && data.InvalidParameters.length > 0){
          logger.log(`Invalid requested params ${data.InvalidParameters}`)
          throw new Error(`Invalid requested params ${data.InvalidParameters}`)
        }
        var output = {}
        var values = data.Parameters.reduce((prev, param) =>{
          var normalizedKey = param.Name.substring(process.env.NODE_ENV.length + 2) // strip the leading / as well
          prev[normalizedKey] = param.Value
          return prev
        }, output)
        
        Object.assign(cache, values) // save to cache
        
        logger.log(`Received params: ${output}`)
      })
    }))
    .then(chunkedResults => chunkedResults.reduce((prev, curr) => prev.concat[curr], []))
  }
  return result.then(values => {
    var output = values 
    if (outputTemplate){
      logger.log('sending params', values)
      output = populateValues(outputTemplate, values)
    }
    return output
  })
}
