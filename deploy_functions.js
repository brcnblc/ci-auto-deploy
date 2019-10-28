"use strict";

const { spawn, spawnSync } = require("child_process"); // Syncronous execution
const fs = require("fs");
const { git, nested } = require('./library');
const deepCopyPro  = require('./deepCopyPro')
const _ = require('lodash');
const md5 = require('blueimp-md5');
const {copyFile, disableLine, parseYmlFile, sleep, passwordPrompt, startingPrompt,
  camelCase, evaluateYaml, dumpYmlFile, dateSuffix} = require('./helper')

// Write last deploy parameters into yaml file
function writeLastDeployedFile(file, field, value){
  let content = {}
  content[field]=value;
  dumpYmlFile(file, content)
}

// eb Sync command
function eb(args, returnError = false, stdin = null, simulate) {
  let result={};
  console.log (`eb ${args}`)
  if (!simulate){
    result = spawnSync(`eb ${args}`, {encoding:'utf8', shell:true, input:stdin});
  } else {
    result = spawnSync(`echo simulate eb`, {encoding:'utf8', shell:true, input:stdin});
    
  }
  
  if (result.status !=0 &! returnError){
    throw result.stdout || result.stderr
  } else {
    return result.stdout || result.stderr
  }
}

// eb Async command
async function runSpawn(command, args, simulate, raiseOnError=true) {
  return new Promise(async function (resolve, reject)  {
    let subProcess, processRunning, exitCode, dots='Wait.';
    console.log (command, args.join(' '))
    if (!simulate) {
      subProcess = spawn(command, args, {shell:true});
    } else {
      subProcess = spawn('echo', [command, 'simulated'], {shell:true});
    }
    
    subProcess.on('data', data => console.log(`${data.toString()}`));
    
    processRunning = true;
    
    subProcess.stdout.on('data', data => console.log(`${data.toString()}`));
   
    subProcess.stderr.on('data', data => {
      if (raiseOnError){
        reject(data.toString())
      } else {
        console.log(`${data.toString()}`)
      }
    });

    subProcess.on('close', code => {processRunning = false; exitCode = code})
    
    while (processRunning){
      dots += '.';
      await sleep(1000)
      //process.stdout.write(`\r\n${dots}`)
    }

    resolve(exitCode)
  })

}

// Write last ran configuration 
function writeLastRun(kwArgs){

  let lastRunFile;
  const exceptionList = ['cloud','path']
  
  if (kwArgs && kwArgs.lastRunFile && kwArgs.deployPath ){
    lastRunFile = kwArgs.deployPath + '/' + kwArgs.lastRunFile
  } else {
    lastRunFile = kwArgs.lastRunFile;
  }
  const copyOfkwArgs = deepCopyPro(kwArgs, {omitKeys:exceptionList})
  writeLastDeployedFile(lastRunFile, 'kwArgs', copyOfkwArgs)

}

function evaluateSubConfig(kwArgs, lastRunConfig, configKey, forceDefaults){
    
  if (kwArgs[configKey].includes('last')) {
    // If it includes || and forceDefaults = false
    const evalarg = kwArgs[configKey].split('||')
    if (evalarg.length == 2 &! forceDefaults && lastRunConfig.errno == -2){
      kwArgs[configKey] = evalarg[1].trim()
      return
    }

    // If it does not include ||
    if (lastRunConfig.errno == -2 || forceDefaults) {
      const {cloudProvider, cloud} = kwArgs;
      const cloudProviderDefaults = cloud && cloud[cloudProvider];
      if (cloudProviderDefaults) {
        const configKeyDefault = cloudProviderDefaults[configKey];
        if (configKeyDefault){
          kwArgs[configKey] = configKeyDefault
        } else {
          throw (`Please indicate ${configKey} explicitly or configure it in the defaults file.`)
        }
      } else {
        throw (`Please indicate ${configKey} explicitly or create a cloud defaults file.`)
      }
    } else {
      kwArgs[configKey] = lastRunConfig.kwArgs[configKey]
    }
  }
}

function evaluateLast(kwArgs, forceDefaults = false) {
  // Read and apply last ran configuration
  const lastRunConfig = parseYmlFile(kwArgs.lastRunFile)

  // Evaluate last ran cloud provider
  if (kwArgs.cloudProvider.includes('last')) {
    if (lastRunConfig.errno == -2) {
      const evalarg = kwArgs.cloudProvider.split('||')
      if (evalarg.length == 1){
        throw (`Please indicate cloud provider explicitly with --cloud-provider argument or define it under defaults section of 
        "${kwArgs.configFile}" file such as :
        defaults:
          cloudProvider: myDefaultProvider`)
      } else {
        kwArgs.cloudProvider = evalarg[1].trim()
      }
      
    } else {
      kwArgs.cloudProvider = lastRunConfig.kwArgs.cloudProvider
    }
  }

  const lastConfigKeys = ['application', 'environment', 'cloudService', 'commandLineTool', 'launchFile', 'deployConfigFile']

  lastConfigKeys.forEach(item => evaluateSubConfig(kwArgs, lastRunConfig, item, forceDefaults))
  
}

function checkFiles(kwArgs, raiseError = false){
  const fileList = [kwArgs.launchFile, kwArgs.deployConfigFile]
  for (let i=0;i<fileList.length;i++){
    if (!fs.existsSync(fileList[i])){
      if (raiseError){
        throw(`File ${fileList[i]} does not exist`)
      }
      return false
    }
  }

  return true;
}

function printStartingParameters(kwArgs){
  console.log(`
Deployment will start with following parameters:
Cloud Provider: ${kwArgs.cloudProvider}
Cloud Service: ${kwArgs.cloudService}
Command Line Tool: ${kwArgs.commandLineTool} 
Application: ${kwArgs.application}
Environment: ${kwArgs.environment}
        `)
}

async function askPassword(kwArgs, appConfiguration, environment){
  const passwordFileContent = parseYmlFile(kwArgs.passwordFile)

  if ((appConfiguration.prompt == 'password' || environment == 'production')){
    if (passwordFileContent.errno == -2){throw(`Error: Password file ${kwArgs.passwordFile} not found`)}
    const passwords = passwordFileContent.passwords
    const environmentPassword = passwords && passwords[environment]
    
    if (!environmentPassword) {throw(`Password definition for ${environment} environment not found in ${kwArgs.passwordFile}`)}
    
    let passOk = false;
    
    if ((!kwArgs.passwords || kwArgs.passwords == null) && (!kwArgs.passwordHashs || kwArgs.passwordHashs == null)){
      passOk = await passwordPrompt(environment, environmentPassword, 3);
      if (!passOk){throw('Wrong Password in user entry.')}
    } else if (kwArgs.passwords != null){
      if (!kwArgs.passwords[environment]){throw(`--passwords argument does not contain definition for ${environment} environment.`)}
      passOk = (md5(kwArgs.passwords[environment]) == environmentPassword)
      if (!passOk){throw(`Wrong Password in --passwords argument.`)}

    } else if (kwArgs.passwordHashs != null){
      if (!kwArgs.passwordHashs[environment]){throw(`--passwordHashs argument does not contain definition for ${environment} environment.`)}
      passOk = (kwArgs.passwordHashs[environment] == environmentPassword);
      if (!passOk){throw(`Wrong Password in --password-hashs argument.`)}
    }
    
  } else if (appConfiguration.prompt == 'prompt'){
    const userInput = await startingPrompt('y')
    if (!userInput){throw ('Process aborted on user input.')}
    
  }
}

function checkTokenFile(kwArgs, appConfiguration, environment){
  if (kwArgs.copySecrets){
    const tokenFile = appConfiguration.tokenFile
    if (!tokenFile){throw(`Token file definition for ${environment} could not be found.`)}
    const tokenFileContent = parseYmlFile(tokenFile)
    if (tokenFileContent.errno == -2){throw(`Token file ${tokenFile} does not exist.`)}
  }
}

// ----  INIT DEPLOY ------
async function initDeploy(kwArgs){
  let exitCode;

  // Evaluate last ran configuration
  evaluateLast(kwArgs);
  
  let filesExist = checkFiles(kwArgs, false)
  if (!filesExist){
    evaluateLast(kwArgs, true)
  }

  checkFiles(kwArgs, true)

  const deployConfig = parseYmlFile(kwArgs.deployConfigFile)
  const configuration = evaluateYaml (deployConfig, {args:kwArgs})
  let {cloudProvider, cloudService, commandLineTool, application, environment, appConfig} = kwArgs;
  
  const mainConfigName = camelCase(`${cloudProvider}_${cloudService}_${commandLineTool}`,'_');
  const mainConfig = configuration.cloudProvider[cloudProvider].platform[mainConfigName]
  if (!mainConfig){
    throw (`Configuration for ${mainConfigName} not found in ${kwArgs.deployConfigFile}`)
  }
  const environmentSection = mainConfig.environment
  if (!environmentSection){
    throw (`environment section not found in ${kwArgs.deployConfigFile}`)
  }
  const environmentConfig = environmentSection[environment]
  if (!environmentConfig){
    throw (`Configuration for ${environment} environment not found in ${kwArgs.deployConfigFile}`)
  }
  

  const envGroups = environmentConfig.group
  
  _.merge(kwArgs, {input: {cloudConfig: configuration}})
  
  // Batch Processiong
  if (kwArgs.application in envGroups){
    const mainApplicationName = kwArgs.application
    // Print starting args
    printStartingParameters(kwArgs)

    // ask password
    await askPassword(kwArgs, environmentConfig.defaults, environment)
    
    // Check if token file exists if copy-secrets is true
    checkTokenFile(kwArgs, environmentConfig.defaults, environment)
    
    const items = envGroups[kwArgs.application]
    
    console.log (`Process started for ${items.length} application${items.length > 1 ? 's' : ''}
     in ${environment} environment.`)
    
    let cnt = 0, scnt=0, error = false;
    
    // Loop through items
    for (let appName of items){
      cnt++;

      
      
      kwArgs.application = appName;
      console.log(`\nStep ${cnt} of ${items.length}`)
      console.log(`----- Deploying "${appName}" into "${environment}" environment -----\n`)
      
      try { 
        const appConfigPath = ['application', appName, 'configuration', appConfig]
        const appConfiguration = _.get(environmentConfig, appConfigPath);
        
        if (!appConfiguration){
          throw (`${application} ${appConfig} configuration for ${environment} environment not found !`);
        }
          // Deploy
          _.merge(kwArgs, appConfiguration)
          _.merge(kwArgs, {input: {appConfig: appConfiguration}})
          exitCode = await deploy(kwArgs, appConfiguration);
        
          scnt++;
      } catch (err) {
        error = true;
        if (kwArgs.debug && err.stack){
          console.error(err.stack)
        } else {
          console.error(err)
          }
      }

      console.log(`\n----- End of deployment ${appName} ${appConfig} into ${environment} environment -----\n`)
      
    }

    //End of batch deployment.
    console.log(`${scnt} items deployed.\n`);
    
    if (error){
      console.error(`\n${cnt - scnt} items could not be deployed.\n`);
      throw -1
    }

     // Write to last run file if process is succesfull
     if (exitCode == 0){
       kwArgs.application = mainApplicationName
      writeLastRun(kwArgs)
      }
    
  } else {
      // Extract configuration
      const appConfigPath = ['application', application, 'configuration', appConfig]
      const appConfiguration = _.get(environmentConfig, appConfigPath);
      
      // Check if configuration exists
      if (!appConfiguration){
        throw (`${application} ${appConfig} configuration for ${environment} environment not found !`);
      }
      
      // Print starting args
      printStartingParameters(kwArgs)

      // ask password
      await askPassword(kwArgs, appConfiguration, environment)
      
      // Check if token file exists if copy-secrets is true
      checkTokenFile(kwArgs, appConfiguration, environment)

      // Merge appConfiguration into kwArgs
      _.merge(kwArgs, appConfiguration)
      _.merge(kwArgs, {input: {appConfig: appConfiguration}})

      // Execute eb command
      console.log(`\n----- Deploying ${application} ${appConfig} configuration into ${environment} environment -----\n`)
      exitCode = await deploy(kwArgs, appConfiguration)
      console.log(`\n----- End of deployment ${application} ${appConfig} into ${environment} environment -----\n`)

      // Write to last run file if process is succesfull
      if (exitCode == 0){
        writeLastRun(kwArgs)
      }
  }

  

  return exitCode;
}

// DEPLOY Main Function
async function deploy(kwArgs, appConfiguration) {
  
  let exitCode;
  
  let {cloudProvider, cloudService, commandLineTool, application, environment, appConfig} = kwArgs;

  //Read last run config
  let lastRunFileContents = parseYmlFile(kwArgs.lastRunFile) || {};
  if (lastRunFileContents.kwArgs){
    if (!cloudProvider){cloudProvider = lastRunFileContents.kwArgs.cloudProvider}
    if (application == 'last'){application = lastRunFileContents.kwArgs.application}
    if (!environment){environment = lastRunFileContents.kwArgs.environment}
  }

  //Read aws ebconfig yml file
  let ebConfigContents = parseYmlFile('.elasticbeanstalk/config.yml', 'utf8')
  if (ebConfigContents && application == 'last'){
    application = ebConfigContents.global.application_name}

  //Call platform specific deploy function
  switch (`${cloudProvider},${cloudService},${commandLineTool}`){
    case 'aws,elasticbeanstalk,eb':
      await deployAwsElasticBeansTalk(kwArgs, appConfiguration)
      .then(code => {exitCode = code})
      .catch(err => {
        if (!kwArgs.debug){
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

  return exitCode;
}

// Evaluate Cname
function evaluateCname(kwArgs, appConfiguration, environmentName){
  let cname;
  const {application, environment} = kwArgs;
  if (appConfiguration.activeCname == environmentName &! kwArgs.cname &! appConfiguration.cname){
    cname = appConfiguration.activeCname;
  } else if (kwArgs.cname){
    cname = `${application}-${environment}-${kwArgs.cname}`
  } else if (appConfiguration.cname) {
    cname = `${application}-${environment}-${appConfiguration.cname}`
  } else if (kwArgs.envSuffix){
    cname = `${application}-${environment}-${kwArgs.envSuffix}`
  } else {
    cname = `${application}-${environment}`
  }
  return cname
}

// Evaluate and override launch configuration
function evalLaunch(kwArgs, createParameters, launch){
  if (launch){
    let dict = evaluateYaml(parseYmlFile(kwArgs.launchFile));
    const launchKeys = [];
    nested(dict, (cb) => {
      if (cb.level == 1 && launchKeys.indexOf(cb.item) == -1){launchKeys.push(cb.item)}
    });
    let dictValue = dict[launch];
    if (!dictValue){throw (`Launch configuration ${launch} not found!`)}
    launchKeys.forEach(item=>{
      delete(createParameters[item])
    })
    _.merge(createParameters, dictValue)
  }
}

// AWS Elastic Beans Talk Deployement by eb client tool
async function deployAwsElasticBeansTalk (kwArgs, appConfiguration) {
  //_.merge(kwArgs, appConfiguration)
  const {environmentFile, disableLines, ebignoreContent} = appConfiguration;
  const {application, environment, region, launch} = kwArgs;
  let createParameters = appConfiguration.create
  const environmentName = `${application}-${environment}` + (kwArgs.envSuffix ? `-${kwArgs.envSuffix}` : '')
  
  // Evaluate cname
  const cname = evaluateCname(kwArgs, appConfiguration, environmentName);
  const isActiveEnvironment = (cname == appConfiguration.activeCname);
  
  // Evaluate Launch
  evalLaunch(kwArgs, createParameters, launch)

  // Start Job
  try {

    let result, exitCode, ebArgs;

    // Copy env file
    copyFile(environmentFile, kwArgs.envFile);

    // Copy secrets
    if (kwArgs.copySecrets){
      const tokenFile = appConfiguration.tokenFile
      if (!tokenFile){throw(`Token file definition for ${environment} could not be found.`)}
      const tokenFileContent = parseYmlFile(tokenFile)
      if (tokenFileContent.errno == -2){throw(`Token file ${tokenFile} does not exist.`)}
      const tokenContent = evaluateYaml(tokenFileContent)
      const tokens = tokenContent[environment][application]
      let envFileContent = fs.readFileSync(environmentFile,{encoding:'utf8'}) 
      if (tokens){
        envFileContent += '\n\n# Auto inserted by ci-auto-deploy\n'
        for (let [key, value] of Object.entries(tokens)){
          envFileContent += key + '=' + value + '\n'
        }
        console.log(`Tokens inserted into ${environmentFile} from ${tokenFile} for ${application} `)
      } else {
        console.log(`\nNo secret definition exists for ${application} in ${tokenFile}`)
      }
      fs.writeFileSync(kwArgs.envFile, envFileContent)
    }

    // init eb 
    let ebCmd = `init ${application} --region ${region} --platform Node.js --keyname aws`
    console.log(`\nInitializing elasticbeanstalk with ${ebCmd}`)
    result = eb(ebCmd, null, null, kwArgs.simulate)
    console.log(result)

    // Copy elastic beans talk config file
    //copyFile(configFile, '.elasticbeanstalk/config.yml');

    if (kwArgs.buildRun){
      console.log(`Building application.`)
      exitCode = await runSpawn('npm', ['run', kwArgs.buildScript], false)
      if (exitCode != 0){throw(exitCode)}
    }

    if (!kwArgs.buildDeploy){
      // Copy .gitignore file onto .ebignore file
      copyFile('.gitignore', '.ebignore');

      // comment lines in ignore file
      disableLines.forEach(element => {
        disableLine(element, '.ebignore', '#')
      });
    } else {
      fs.writeFileSync('.ebignore', ebignoreContent.join('\n'))
    }
   

    // Check Status of environment
    const status = {}
    console.log('\nChecking status of ' + environmentName + ' ...')
    result = eb(`status ${environmentName}`, true)
    const statRaw = result.split('\n')
    for (let i=1; i< statRaw.length - 1 ; i++){
      const row = statRaw[i].trim().split(': ')
      if (row[0] && row[1]){
        status[row[0].trim()] = row[1].trim()
      }
    }

    if (!result.includes('NotFoundError')){ console.log(result);}

    // Check status to be ready to continue.
    if (status.Status && status.Status != 'Ready'){
      throw (`Environment "${environmentName}"  is in "${status.Status}" state. It should be in "Ready" state in order to update.`)
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
        console.log(`\nEnvironment ${environmentName} not found. Creating ${environmentName} environment. This will take a few minutes.\n`)
        if (!createParameters.cname) {createParameters['cname'] = cname};
        let createArgs = ['create', environmentName, "--nohang"];
        for (let [key, value] of Object.entries(createParameters).sort()) {
          createArgs.push(`--${key}`);
          if (typeof value != 'boolean') {createArgs.push(`"${value}"`)};
        }
        
        exitCode = await runSpawn('eb', createArgs, kwArgs.simulate)
        if (exitCode != 0){ throw ('Error occurred while creating environment.')}
      } else {
        throw result
      }
      return exitCode
    }

    //Check environment Again
    result = eb(`use ${environmentName}`, true)
    if (result.search('ERROR: NotFoundError') > -1){
      throw `Environment ${environmentName} not found.`
    }

    // Deploy
    console.log('Deploying Application. \n')
    ebArgs = ['deploy', environmentName];

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
    ebArgs.push('-p')
    ebArgs.push('--nohang')
    exitCode = await runSpawn('eb', ebArgs, kwArgs.simulate)
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

          const newStatus = eb(`status ${environmentName}`)
          const statusStart = newStatus.indexOf('Status');
          const statusEnd = newStatus.indexOf('\n',statusStart);
          const statusStr = newStatus.substring(statusStart, statusEnd)
          console.log('Retry ', cnt, ' ', statusStr);
          if (newStatus.includes('Status: Ready')){
            clearInterval(interval);
            const findInd = ebArgs.indexOf('--label');
            const oldVersion = ebArgs[findInd + 1].replace(/\"/g,'');
            const newVersion = oldVersion + '-' + dateSuffix('_')
            ebArgs[findInd + 1] = newVersion
            console.log(`Retrying to deploy application with time stamp as ${newVersion}`)
            runSpawn('eb', ebArgs, kwArgs.simulate)
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

module.exports = initDeploy;
