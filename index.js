"use strict";

// const { exec } = require('child_process');
const AWS = require("aws-sdk");
const BbPromise = require("bluebird");

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.log = this.serverless.cli.log.bind(this);

    this.commands = {};

    this.hooks = {
      //'after:aws:deploy:deploy:updateStack': this.updateVersionToSsm.bind(this)
      // 'after:aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
      //           .then(this.updateVersionToSsm)
      "before:package:package": () =>
        BbPromise.bind(this).then(this.updateVersionToSsm),
    };
  }

  updateVersionToSsm() {
    this.serverless.cli.log("SSM API version: Acquiring info...");
    const { stage, region } = this.options;
    const provider = this.serverless.getProvider("aws");
    const awsCredentials = provider.getCredentials();
    const SSM = new AWS.SSM({
      region,
      credentials: awsCredentials.credentials,
    });

    const getSsmParameter = (name) =>
      new Promise((resolve, reject) => {
        var params = {
          Name: name,
        };
        SSM.getParameter(params, (err, data) => {
          if (err) {
            this.serverless.cli.log(`get Parameter err is '${err}'`);
            resolve("");
          } else {
            this.serverless.cli.log(
              `get Parameter res is`,
              JSON.stringify(data)
            );
            resolve(data.Parameter.Value);
          }
        });
      });

    const incrementVersion = (version) => {
      this.serverless.cli.log(`Current version is '${version}'`);
      const currentDate = new Date();
      const newVersionArr = [
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth() + 1,
        currentDate.getUTCDate(),
        0,
      ];
      let newVersion = newVersionArr.join(".");
      this.serverless.cli.log(`Default new version is '${newVersion}'`);
      if (
        version &&
        (typeof version === "string" || version instanceof String) &&
        version.includes(".")
      ) {
        const currVersionArr = version.split(".");
        if (
          newVersionArr.slice(0, 3).join(".") ==
          currVersionArr.slice(0, 3).join(".")
        ) {
          newVersionArr[3] = parseInt(currVersionArr[3]) + 1;
          newVersion = newVersionArr.join(".");
          this.serverless.cli.log(`Incremented new version is '${newVersion}'`);
        }
      }
      return newVersion;
    };

    const putSsmParameter = (name, value) =>
      new Promise((resolve, reject) => {
        var params = {
          Name: name,
          Type: "String",
          Value: value,
          Overwrite: true,
        };
        this.serverless.cli.log(`Incrementing SSM version`, name, value);
        SSM.putParameter(params, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

    const ssmPrefix =
      this.serverless.service.custom &&
      this.serverless.service.custom.ssmApiVersion &&
      this.serverless.service.custom.ssmApiVersion.ssmPrefix
        ? this.serverless.service.custom.ssmApiVersion.ssmPrefix.replace(
            /<stage>/g,
            stage
          )
        : `/app/${stage}/versions/`;
    const ssmParameterName = ssmPrefix + this.serverless.service.service;

    let promise = BbPromise.fromCallback((cb) => {
      getSsmParameter(ssmParameterName).then((value) => {
        this.serverless.cli.log(`SSM API version: current version`, value);
        const incrementedVersion = incrementVersion(value.toString());
        this.serverless.cli.log(
          `SSM API version: Updating new version '${incrementedVersion}' to SSM with key '${ssmParameterName}'`
        );
        putSsmParameter(ssmParameterName, incrementedVersion).then((value) => {
          cb();
        });
      });
    });

    return promise;
  }
}

module.exports = ServerlessPlugin;
