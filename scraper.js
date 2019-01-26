'use strict'

const fs = require('fs');
const rp = require('request-promise');
const path = require('path');

const re = new RegExp('^_');
let host = "http://www.hl7.org/fhir/STU3/";
let BASE_DIR = path.join(__dirname, 'fhir', 'schema')

const getResourceName = (resource) => {
    let id = resource.id.split('/')
    return `${id[id.length - 1]}.schema.json`
}

const flatten = list => list.reduce(
    (a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []
);

let jsonDefinitions = {}

const formatResource = (json) => {
    let definitions = []
    try {
        Object.keys(json.definitions).forEach( resource => {
            if( json.definitions[resource].allOf ) {
                let index = 0;
                if( json.definitions[resource].allOf.length > 1) {
                    index = 1;
                    // Update ref
                    // let ref = json.definitions[resource].allOf[0]['$ref'].split('#');
                    // if( ref.length === 2 && ref[0]) { // Move ref as resource definition
                    //     json.definitions[resource].allOf[0]['$ref'] = `#${ref[1]}`;
                    //     if( !json.definitions[ref[0]]) {
                    //         definitions.push(`${ref[0]}.schema.json`)
                    //     }                        
                    // }
                }
                
                for(let prop of Object.keys(json.definitions[resource].allOf[index].properties)) {
                    if(prop.match(re)) { // Delete underscore fields
                        delete json.definitions[resource].allOf[index].properties[prop]
                    } else {
                        let ref;
                        if( json.definitions[resource].allOf[index].properties[prop]['$ref']) {
                            ref = json.definitions[resource].allOf[index].properties[prop]['$ref'].split('#');
                            if( ref.length === 2 && ref[0]) {
                                json.definitions[resource].allOf[index].properties[prop]['$ref'] = `#${ref[1]}`;
                                if(!json.definitions[resource].allOf[index].properties[prop].type) {
                                    json.definitions[resource].allOf[index].properties[prop].type = "object";
                                }
                                if( !json.definitions[ref[0].replace('.schema.json', '')]) {
                                    definitions.push(ref[0])
                                }
                            }
                            if( ref[0] === 'Annotation.schema.json' && getResourceName(json) === 'Patient') {
                                console.log('!!!ANNOTATION', definitions.join(', '))
                            }
                        }
                        if( json.definitions[resource].allOf[index].properties[prop].items && 
                            json.definitions[resource].allOf[index].properties[prop].items['$ref'])
                        {
                            // obj.definitions[resource].allOf[index].properties[prop].items.type = "object";
                            ref = json.definitions[resource].allOf[index].properties[prop].items['$ref'].split('#');
                            if( ref.length === 2 && ref[0]) {
                                json.definitions[resource].allOf[index].properties[prop].items['$ref'] = `#${ref[1]}`;
                                if(!json.definitions[resource].allOf[index].properties[prop].items.type) {
                                    json.definitions[resource].allOf[index].properties[prop].items.type = "object";
                                }
                                if( !json.definitions[ref[0].replace('.schema.json', '')]) {
                                    definitions.push(ref[0]) 
                                }
                            }  
                        }
                    }
                }

                // NOTE: for download all files. Comment if you want to group into definitions
                json.definitions[resource] = json.definitions[resource].allOf[index];
                // necessary for react-jsonschema-form
                json.type = "object";

            } else if ( json.definitions[resource].oneOf ) {
                for( let obj of json.definitions[resource].oneOf ) {
                    let ref = obj['$ref'].split('#');
                    if( ref.length === 2 && ref[0]) {
                        obj['$ref'] = `#${ref[1]}`;
                        if( !json.definitions[ref[0]]) {
                            definitions.push(ref[0]);
                        }
                    }
                }
            }
        })

        return {resource: json, definitions: [...new Set(definitions)]}
    } catch( e ) {
        console.log('Error...', e);
    }
}

const download = (url, resourceName) => {
    if( jsonDefinitions[resourceName] ) {
        return new Promise((resolve, reject) => resolve(jsonDefinitions[resourceName]))
    } else {
        return rp(url).then((res) => {
            let json = JSON.parse(res);
            let {resource, definitions} = formatResource(json)
            jsonDefinitions[resourceName] = {resource, definitions}
            return {resource, definitions}
        }).catch((err) => {
            console.error(`Error parse ${url}}`, err)
        })
    }
}


const downloadResources = async(resourceNames) => {
    return Promise.all(
        resourceNames.map( resourceName => 
            download(`${host}${resourceName}`, resourceName)
                .then( result => {
                    let {resource, definitions} = result;
                    fs.writeFileSync(path.join(BASE_DIR, resourceName), JSON.stringify(resource), 'utf-8');
                    return definitions.length ? {resource, definitions} : null
                }))
    ).then( resourcesToProcess => {
        return resourcesToProcess.filter(r => r !== undefined )
    })
}


const downloadResourceDefinitions = async(resourceToProcess) => {    
    let newDefinitions = []
    for( let definition of resourceToProcess.definitions ) {
        let result = await download(`${host}${definition}`, definition).then( result => {
            let definitionName = definition.replace('.schema.json', '');
            resourceToProcess.resource.definitions[definitionName] = result.resource.definitions[definitionName];
            return result.definitions // return new definitions found not already present i
        })
        newDefinitions = [...new Set([...newDefinitions, ...result])]
    }

    fs.writeFileSync(path.join(BASE_DIR, getResourceName(resourceToProcess.resource)), JSON.stringify(resourceToProcess.resource), 'utf-8');

    newDefinitions = newDefinitions.filter( d => !resourceToProcess.resource.definitions[d.replace('.schema.json', '')])

    return newDefinitions.length > 0 ? {resource: resourceToProcess.resource, definitions: newDefinitions} : null 
}

const crawl = async() => {
    console.time("crawler");
    console.log('Start crawling')
    let resourceNames = fs.readdirSync(BASE_DIR)
    let resourcesToProcess = await downloadResources(resourceNames)
    
    // resourcesToProcess.map( r => console.log(`Remaining: ${getResourceName(r.resource)}\ndefinitions: ${r.definitions.map(d=> d.replace('.schema.json','')).join(', ')}\n\n`))
    console.log('-------------------------------')

    while( resourcesToProcess.length > 0 ) {
        let newResourcesToProcess = await Promise.all(
            resourcesToProcess
                .map( resourceToProcess => downloadResourceDefinitions(resourceToProcess)
                .then( newDefinitions => newDefinitions))
        )
        resourcesToProcess = newResourcesToProcess.filter(r => !!r)
        //resourcesToProcess.map( r => console.log(`Remaining: ${getResourceName(r.resource)} definitions: ${r.definitions.length}\n\n`))        
    }
    console.timeEnd("crawler");
    console.log('***********************************')
    console.log('********    COMPLETE !!!   ********')
    console.log('***********************************')
}


crawl();