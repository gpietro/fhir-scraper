import urllib.request
import os
import shutil
from bs4 import BeautifulSoup


url = "http://www.hl7.org/fhir/STU3/resourcelist.html"
PROJECT_DIR = os.path.dirname(os.path.realpath(__file__))
BASE_DIR = os.path.join(PROJECT_DIR, 'fhir', 'schema')

if os.path.exists(BASE_DIR):
    shutil.rmtree(BASE_DIR)

os.makedirs(BASE_DIR)

with urllib.request.urlopen(url) as response:
    html = response.read()
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select('#tabs-1')[0]
    for i, content in enumerate(table.select('tr.frm-contents')):
        for tdC in content.select('td.frm-set'):
            for resource in content.select('li'):
                open(os.path.join(BASE_DIR, resource.select('a')[0].string + '.schema.json'), 'w+')        