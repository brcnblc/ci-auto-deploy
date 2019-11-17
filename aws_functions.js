// ----------  CI-Auto-Deploy Cloud Deployment Program Using AWS Client Tool ------------------------
//
// # Author : Bircan Bilici 
// # Github: https://github.com/brcnblc
// # Licence : MIT
//
// --------------------------------------------------------------------------------------------------

"use strict";
const { evaluateYaml, parseYmlFile } = require("./yaml_script")

function awsClient(kwArgs) {
  

  if (!kwArgs.commandFile){
    console.error(`Command File Should be specified.`)
    throw(-1)
  }
  let context = {args: kwArgs};
  for (let [key, value] of Object.entries(kwArgs)){
    let lineContent = `${key}: ${value}`;
    
    let options;
    options = {lineNumber: 23, lineContent: `Yaml Parse Error in ${key} Argument : ${value}`,  yamlFileName: process.argv[1], debug:kwArgs.debug}
    let evaluatedArgument = evaluateYaml (null, context, lineContent, options);
    kwArgs[key] = evaluatedArgument[key];
  }

  let script = evaluateYaml(kwArgs.commandFile, {...context}, null, {debug:kwArgs.debug});

let a
}

module.exports = awsClient;