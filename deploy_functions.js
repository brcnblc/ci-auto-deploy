"use strict";

const { spawn, spawnSync, fork , exec} = require("child_process"); // Syncronous execution
const fs = require("fs");
const YAML = require('yaml');
const { git, nested, escapeRegExp } = require('./library');
const dotProp = require ('dot-prop-immutable');
const debug = true;


// Copies source file on to target and replaces the target content.
function copyFile(source, target) {
  const processOptions = {encoding: 'ascii', shell: true};

  try {
    let result;
    result = spawnSync (`cp -f ${source} ${target}`, processOptions);
    if ( result.status != 0) throw result.stderr;
    console.log(`${source} file coppied onto ${target} file.`);
  }
  catch (err) {
    throw err;
  }
}

// Disables the line by commenting
function disableLine (searchString, file, commentCharacter) {
  try {
    let fileContent = fs.readFileSync(file, 'utf8');
    const findKeys = fileContent.search(new RegExp(`^${escapeRegExp(searchString)}`,'m'), fileContent);
    if (findKeys > -1) {
      fileContent = fileContent.substr(0, findKeys) + commentCharacter + fileContent.substring(findKeys);
      fs.writeFileSync(file, fileContent);
    }
    console.log(`${searchString} has been commented in ${file} file.`);
  }
  catch (err) {
    throw err;
  }
}

function listFiles(folder, extension) {
  const ls = fs.readdirSync(folder, {encoding: 'ascii'});
  const lsFiles = ls.filter(v=>!fs.statSync(folder + '/' + v).isDirectory());
  const lsFiltered = lsFiles.filter(v=>v.substr(-5, 5) == extension)
  return lsFiltered
}

function deploymentConfigurations(configFolder){
  const configFiles = listFiles(configFolder, '.json');
  const deployConfig = {};
  configFiles.forEach(file => {
    const fileContent = JSON.parse(fs.readFileSync(configFolder + '/' + file, {encoding:'utf8'}));
    Object.keys(fileContent).forEach(key=>{
      deployConfig[key] = fileContent[key];
    })
  })
  return deployConfig
}

function parseJsonFile(file){
  try {
    let strFileContents = fs.readFileSync(file, 'utf8')
    return JSON.parse(strFileContents)

  } catch (err){
    if (err.errno != -2){
      console.error(err);
      throw (err)
    }
  }
}

function parseYmlFile(file){
  try {
    let strFileContents = fs.readFileSync(file, 'utf8')
    return YAML.parse(strFileContents)

  } catch (err){
    if (err.errno != -2){
      console.error(err);
      throw (err)
    }
  }
}

function writeLastDeployedFile(file, field, value){
  let fileContents = parseJsonFile(file) || {};

  fileContents[field] = value
  fs.writeFileSync(file, JSON.stringify(fileContents, null, 2))
}

async function deploy(kwArgs) {

  let exitCode;
  const {configFolder} = kwArgs;
  const deployConfigurations = deploymentConfigurations(configFolder);
  let {cloudProvider, cloudService, cloudTool, application, environment} = kwArgs;

  //Read last run config
  let lastRunFileContents = parseJsonFile(kwArgs.lastRunFile) || {};
  if (lastRunFileContents.kwArgs){
    if (!cloudProvider){cloudProvider = lastRunFileContents.kwArgs.cloudProvider}
    if (application == 'last'){application = lastRunFileContents.kwArgs.application}
    if (!environment){environment = lastRunFileContents.kwArgs.environment}
  }

  //Read ebconfig yml file
  let ebConfigContents = parseYmlFile('.elasticbeanstalk/config.yml', 'utf8')
  if (ebConfigContents && application == 'last'){
    application = ebConfigContents.global.application_name}

  kwArgs.application = application;
  kwArgs.environment = `${application}-${environment}`;
  kwArgs.cloudProvider = cloudProvider;

  if (application == 'last' |! application ){
    throw('Application can not be null.')}

  const config = `${cloudProvider},${cloudService},${cloudTool},${application},${environment}`;
  const deployConfig = deployConfigurations[config];

  if (!deployConfig)throw (`Configuration "${config}" not found !`);

  switch (`${cloudProvider},${cloudService},${cloudTool}`){
    case 'aws,ebt,eb':
      await deployAwsElasticBeansTalk(kwArgs, deployConfig)
      .then(code => {exitCode = code})
      .catch(err => {
        if (!debug){
          console.error('Error :', err); throw (-1)
        } else {
          console.error(err.stack || err)
          throw (-1)
        }

      })
      break;
    default:
      console.error ('Deployment Function Does not exist !');
      throw (-1);
  }

  // Write last ran succesfull configuration
  if (exitCode == 0){
    writeLastDeployedFile(kwArgs.lastRunFile, 'kwArgs', kwArgs)
  }

  return exitCode;
}

// eb Sync command
function eb(args, returnError = false, stdin = null) {
  let result;
  result = spawnSync(`eb ${args}`, {encoding:'utf8', shell:true, input:stdin});

  if (result.status !=0 &! returnError){
    throw result.stdout || result.stderr
  } else {
    return result.stdout || result.stderr
  }
}

function sleep(ms){
  return new Promise(resolve=>{
      setTimeout(resolve,ms)
  })
}

// ebAsync
async function runSpawn(command, args) {
  return new Promise(async function (resolve, reject)  {
    let processRunning, exitCode, dots='Wait.';
    const subProcess = spawn(command, args, {shell:true});
    subProcess.on('data', data => console.log(`${data.toString()}`));
    processRunning = true;
    subProcess.stdout.on('data', data => console.log(`${data.toString()}`));
    subProcess.stderr.on('data', data => {reject(data.toString())});
    subProcess.on('close', code => {processRunning = false; exitCode = code})
    while (processRunning){
      dots += '.';
      await sleep(1000)
      //process.stdout.write(`\r\n${dots}`)
    }

    resolve(exitCode)
  })


}

// Evaluate create parameters
function evaluateCreateConfigFile(createParams){
  let params = {};
  const {config} = createParams || {};
  const {file, launch} = config || {};

  // function to replace #elements and convert arrays to strings
  function replaceContent(contentObject, key, value){
    if (value[0] == '#'){
      const replaceWith = dotProp.get(contentObject, value.substr(1))
      params[key] = Array.isArray(replaceWith) ? replaceWith.join(',') : replaceWith
    } else {
      params[key] = Array.isArray(value) ? value.join(',') : value
    }
  }

  //Evaluate config file
  if (file && launch){
    const fileContents = JSON.parse(fs.readFileSync(file, 'utf8'));
    const selection = fileContents[launch];

    for (let [key, value] of Object.entries(selection)){
      replaceContent(fileContents, key, value)
    }
  }

  //Evaluate other parameters
  for (let [key, value] of Object.entries(createParams)){
    if (key == 'config') continue;
    replaceContent(createParams, key, value)
  }

  return params

}

// AWS Elastic Beans Talk Deployement by eb client tool
async function deployAwsElasticBeansTalk (kwArgs, configuration) {

  const {environmentFile, configFile, disableLines} = configuration;
  const {application, environment} = kwArgs;


  const createParameters = evaluateCreateConfigFile(configuration.createParameters);


  try {

    let result, exitCode, ebArgs;

    // Copy env file
    copyFile(environmentFile, '.env');

    // Copy elastic beans talk config file
    copyFile(configFile, '.elasticbeanstalk/config.yml');

    // Copy .gitignore file onto .ebignore file
    copyFile('.gitignore', '.ebignore');

    // comment lines in ignore file
    disableLines.forEach(element => {
      disableLine(element, '.ebignore', '#')
    });

    // Check Status of environment
    const status = {}
    console.log('Checking status of ' + environment + ' ...')
    result = eb(`status ${environment}`, true)
    const statRaw = result.split('\n')
    for (let i=1; i< statRaw.length - 1 ; i++){
      const row = statRaw[i].trim().split(': ')
      if (row[0] && row[1]){
        status[row[0].trim()] = row[1].trim()
      }
    }

    console.log(result);

    // Check status to be ready to continue.
    if (status.Status && status.Status != 'Ready'){
      throw (`Environment "${environment}"  is in "${status.Status}" state. It should be in "Ready" state in order to update.`)
    }

    // Get Other parameters
    let {descriptionText, existingVersion, deployStaged,
      forceUpdate, revisionPrefix, revisionNumber, versionSuffix} = kwArgs;

    // Get Version Label
    let version = kwArgs.versionLabel;
    if (version == 'describe'){
      version = git(`describe --tags --match "${kwArgs.versionPrefix}*.*.*"`).replace('\n','')
    } else if (version == 'package') {
      const packageFileString = fs.readFileSync(kwArgs.packageFile, 'utf8');
      const packageFileContent = JSON.parse(packageFileString);
      version = kwArgs.versionPrefix + packageFileContent['version'];
    }

    // Add Version Suffix
    if (versionSuffix){
      version += '-' + versionSuffix
    }

    // Check deployed version
    const deployedVersion = status['Deployed Version'];
    const deployedVersionLastDigit = deployedVersion && status['Deployed Version'].split('-').pop()

    if (revisionNumber != 'none'){
      if (revisionNumber != 'auto') {
        version += `-${revisionPrefix}${revisionNumber}`
      } else if (deployedVersion && deployedVersion.includes(version)){
        if (version == deployedVersion){
          version += `-${revisionPrefix}1`
        } else {
          const deployedRevNum = parseInt(deployedVersionLastDigit.substr(revisionPrefix.length))
          version += '-' + revisionPrefix + (deployedRevNum + 1).toString()
        }
      }

    }

    // Create environment if it does not exist and force-create argument is passed
    if (result.search('ERROR: NotFoundError') > -1){
      if (kwArgs.forceCreate){
        console.log(`Environment ${environment} not found. Creating ${environment} environment. This will take a few minutes.`)
        if (!createParameters.cname) {createParameters['cname'] = `${environment}`};
        let createArgs = ['create', environment];
        for (let [key, value] of Object.entries(createParameters).sort()) {
          createArgs.push(`--${key}`);
          if (typeof value != 'boolean') {createArgs.push(`"${value}"`)};
        }
        console.log ('eb', createArgs.join(' '))
        exitCode = await runSpawn('eb', createArgs)
        if (exitCode != 0){ throw ('Error occurred while creating environment.')}
      } else {
        throw result
      }
    }

    //Check environment Again
    result = eb(`use ${environment}`, true)
    if (result.search('ERROR: NotFoundError') > -1){
      throw `Environment ${environment} not found.`
    }

    // Deploy
    console.log('Deployment started. ')
    ebArgs = ['deploy', environment];

    if (!existingVersion) {
      ebArgs.push(...['--label', `"${version}"`]);
    }

    if (descriptionText){
      ebArgs.push(...['--message', `"${descriptionText}"`])
    }

    if (existingVersion){
      ebArgs.push(...['--version', `"${existingVersion}"`])
    }

    if (deployStaged){
      ebArgs.push('--staged')
    }

    if (forceUpdate){
      result = eb(`appversion --delete ${version}`, true, 'y\n')
      if (result.includes('deleted successfully')){
        console.log('Old version deleted succesfully')
      } else if (!result.includes('does not have Application Version')){
        console.error(result)
      }
    }

    // Run command
    console.log('eb',ebArgs.join(' '))
    ebArgs.push('-p')
    exitCode = await runSpawn('eb', ebArgs)
    .catch(async function (err) {
      if (err.includes('WARNING: Deploying a previously deployed commit')){
        result = eb('abort')
        console.error('Warning : Version label already exists, Aborting and adding timestamp suffix to version label name.')
        let cnt=0, retry = 5, done=false, ecode=null;
        let interval = setInterval(function intervalFunction(){
          // Wait for Ready State
          cnt++;

          if (cnt > retry) {
            clearInterval(interval);
            throw(`Number of retries exceeded ${retry} while waiting for Ready state.`)
          }

          const newStatus = eb(`status ${environment}`)
          const statusStart = newStatus.indexOf('Status');
          const statusEnd = newStatus.indexOf('\n',statusStart);
          const statusStr = newStatus.substring(statusStart, statusEnd)
          console.log('Retry ', cnt, ' ', statusStr);
          if (newStatus.includes('Status: Ready')){
            clearInterval(interval);
            const findInd = ebArgs.indexOf('--label');
            const oldVersion = ebArgs[findInd + 1].replace(/\"/g,'');
            const newVersion = oldVersion + '-' + new Date().toJSON()
            ebArgs[findInd + 1] = newVersion
            console.log(`Retrying to deploy application with time stamp as ${newVersion}`)
            runSpawn('eb', ebArgs)
            .then(code => {ecode = code;done=true;})
            .catch(err => {ecode = err;done=true})
          }
        }, 5000);

        while(!done){
          await sleep(1000)
        }

        if (ecode != 0){
          throw ecode
        } else {
          return ecode
        }

      } else {
        throw err
      }
    })

    return exitCode

  }
  catch (err) {
    throw err;
  }

}

module.exports = deploy;
