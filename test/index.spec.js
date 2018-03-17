var sinon = require('sinon');
var chai = require('chai');
var config = require('../index');
var sinonTestFactory = require('sinon-test');
var AWS = require('aws-sdk-mock');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
var should = chai.should();
var sinonTest = sinonTestFactory(sinon);

describe('config', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  })
  afterEach(() => {
    AWS.restore();
  });
  it('exists', () => {
    config.should.be.a('function')
  })
  it('throws an error when NODE_ENV is not defined', () => {
    process.env.NODE_ENV = '';
    (() => config()).should.throw('NODE_ENV must be supplied')
  })
  it('throws an error when params is empty', () => {
    (() => config([])).should.throw('params must not be empty')
  })
  it('returns a promise', () => {
    config(['blah']).should.be.an.instanceof(Promise)
  })
  it('fails promise when error', () => {
    AWS.mock('SSM', 'getParameters', (params, cb) => {
      cb(new Error('some AWS error'))
    })
    
    return config(['mysql.host']).should.eventually.be.rejectedWith('some AWS error')
  })
  it('fails promise when there are any invalid parameters returned', () => {
    AWS.mock('SSM', 'getParameters', (params, cb) => {
      cb(null, {InvalidParameters: ['some-invalid-param']})
    })
    
    return config(['mysql.host']).should.eventually.be.rejectedWith('Error: Invalid requested params')
  })
  describe('fetching values', () => {
    beforeEach(()=>{
      AWS.mock('SSM', 'getParameters', (params, cb) => {
        cb(null, {Parameters: [{Name: '/test/mysql.host', Value: 'some-host'}]})
      })
    })
    afterEach(()=>{
      AWS.restore()
    })
    it('returns with values when provided an array', () => {
      return config(['mysql.host']).then(function(values){
        values.should.include({'mysql.host': 'some-host'})
      })
    })
    it('returns with values when provided a string', () => {
      return config('mysql.host').then(function(values){
        values.should.include({'mysql.host': 'some-host'})
      })
    })
    it('returns with cached values when requested', () => {
      var spy = sinon.spy()
      AWS.mock('SSM', 'getParameters', spy)
      return config('mysql.host', true)
        .then(() => config('mysql.host', true))
        .then(() => {
          spy.callCount.should.be.at.most(1)
        })
    })
    it('returns with fresh values by default', () => {
      var spy = sinon.spy()
      AWS.mock('SSM', 'getParameters', spy)
      return config('mysql.host')
        .then(() => config('mysql.host'))
        .then(() => {
          spy.callCount.should.be.at.most(0)
        })
    })
  })
  describe('fetching templated values', () => {
    beforeEach(()=>{
      AWS.mock('SSM', 'getParameters', (params, cb) => {
        cb(null, {Parameters: [{Name: '/test/path/to/ssm', Value: 'blah'}]})
      })
    })
    it('returns with values when provided an object', () => {
      return config({'mysql.host': 'path/to/ssm'}).then(function(values){
        values.should.include({'mysql.host': 'blah'})
      })
    })
    it('returns with values when provided a deep object', () => {
      return config({mysql: {host: 'path/to/ssm'}}).then(function(values){
        values.should.deep.equal({mysql: {host: 'blah'}})
      })
    })
    it('ignores non-string non-object values', () => {
      return config({blah: 3, mysql: {host: 'path/to/ssm'}}).then((values) => {
        should.not.exist(values.blah)
        Object.keys(values).length.should.equal(2)
      })
    })
  })
})
