# FHIR resources STU3 scraper 

This scraper extracts the FHIR resources from hl7.org and modify the schemas to solve the refs circular references.
This is a module of the fhir-framework.

## How to run
This project is split into python and javascript parts. Python extract the main resources from hl7 webisite, by creating empty files for each resource. Javascript crawls and format the json data to match the ajv and react-jsonschema requirements.
1) pip install -r requirements.txt
2) npm install
3) python scraper.py
4) npm start
