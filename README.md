# config
Configuration management for Domuso next-gen tech stack

![CircleCI Status](https://circleci.com/gh/Domuso/config.svg?style=shield&circle-token=b9acc16e755de9410b485b2c2edc8869966af746)

Using this library requires `NODE_ENV`, `AWS_SECRET_ACCESS_KEY`, and `AWS_ACCESS_KEY_ID` environment variables defined.  It utilizes AWS's SSM Param store with the NODE_ENV as the part of the hierarchy.  Usage:

```
var config = require('config')

config.get(['mysql_connection_string','yardi_default_endpoint']).then((values) => {
  console.log(values) // returns ['mysql://user:pass@host/db', 'https://yardi-web-service/wsdl?']
})

```

Values returned are always of type `String` as per AWS convention

You can also pass in a config template object:

```
var template = {
  mysql: {
    host: 'some/ssm/path'
  }
}

configs.get(template).then((conf) => {
  console.log(conf) // returns {mysql:{host: 'actual value'}}
})
```

Keys are cached in-memory for retrieval to prevent unnecessary reloads of the config

Please see the [specification]
(https://docs.google.com/document/d/1HcdwoM-b2TsW7lxCwiIjnGGpHVHvCQu4qqmYXcCqK2c/edit?usp=sharing) for more details