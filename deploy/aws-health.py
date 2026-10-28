#!/usr/bin/env python3
"""Emit bounded MCP health metrics using only the EC2 instance role."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

TARGET = json.loads(Path('/etc/peer-mcp/health-target.json').read_text())
REGION = TARGET['region']
ACCOUNT = TARGET['accountId']
INSTANCE = TARGET['instanceId']
AWS_ENV = {
    'PATH': '/usr/local/bin:/usr/bin:/bin',
    'AWS_REGION': REGION,
    'AWS_CONFIG_FILE': '/dev/null',
    'AWS_SHARED_CREDENTIALS_FILE': '/dev/null',
    'BOTO_CONFIG': '/dev/null',
    'AWS_EC2_METADATA_DISABLED': 'false',
    'AWS_METADATA_SERVICE_TIMEOUT': '2',
    'AWS_METADATA_SERVICE_NUM_ATTEMPTS': '1',
    'AWS_MAX_ATTEMPTS': '2',
    'AWS_PAGER': '',
}


def aws(*args):
    result = subprocess.run(
        ['aws', *args, '--region', REGION, '--output', 'json'],
        env=AWS_ENV, capture_output=True, timeout=45,
    )
    if result.returncode:
        raise RuntimeError('AWS metric operation failed; output suppressed')
    return json.loads(result.stdout) if result.stdout.strip() else {}


def main():
    identity = aws('sts', 'get-caller-identity')
    expected = f"arn:aws:sts::{ACCOUNT}:assumed-role/{TARGET['roleName']}/{INSTANCE}"
    assert identity['Account'] == ACCOUNT and identity['Arn'] == expected
    checks = {}
    for unit in ['peer-mcp']:
        checks[unit] = subprocess.run(
            ['systemctl', 'is-active', '--quiet', unit], capture_output=True,
        ).returncode == 0
    expected_image = json.loads(Path(
        '/var/lib/peer-mcp-migration/build.json'
    ).read_text())["imageId"]
    result = subprocess.run(
        ['docker', 'inspect', 'peer-mcp'], capture_output=True,
        timeout=15,
    )
    checks['image'] = result.returncode == 0 and json.loads(result.stdout)[0]['Image'] == expected_image
    try:
        with urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=10) as r:
            checks['readOnlyHealth']=json.load(r)=={'ok':True,'service':'peer-mcp','version':'0.4.1','profile':'read-only'}
        req=urllib.request.Request('http://127.0.0.1:8080/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}}).encode(),headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
        with urllib.request.urlopen(req,timeout=10) as r:
            checks['catalog']=len(json.load(r)['result']['tools'])==97
        with urllib.request.urlopen('https://mcp.peer.xyz/health',timeout=10) as r:
            checks['publicTls']=r.status==200 and r.headers.get('X-Peer-Origin')=='aws-mcp-20261022'
    except Exception:
        checks['dependencyRequest']=False
    disk = shutil.disk_usage('/')
    free_percent = disk.free * 100 / disk.total
    dimensions = [{'Name': 'InstanceId', 'Value': INSTANCE}]
    aws('cloudwatch', 'put-metric-data', '--namespace', 'Peer/McpProd',
        '--metric-data', json.dumps([
            {'MetricName': 'HealthChecksPassed', 'Value': int(all(checks.values())),
             'Unit': 'Count', 'Dimensions': dimensions},
            {'MetricName': 'DiskFreePercent', 'Value': free_percent,
             'Unit': 'Percent', 'Dimensions': dimensions},
        ]))
    print(json.dumps({'checks': checks, 'diskFreePercent': round(free_percent, 2)}))


if __name__ == '__main__':
    main()
