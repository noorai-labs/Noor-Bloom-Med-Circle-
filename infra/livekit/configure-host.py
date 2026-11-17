#!/usr/bin/env python3
"""Configure the dedicated BLOOM MED LiveKit stack without printing credentials."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--public-ip',required=True)
parser.add_argument('--domain',required=True)
parser.add_argument('--turn-domain',required=True)
args=parser.parse_args()
ipaddress.IPv4Address(args.public_ip)
for hostname in (args.domain,args.turn_domain):
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,240}[a-z0-9]',hostname):
        raise SystemExit('Invalid hostname')
if os.geteuid()!=0:
    raise SystemExit('Run with sudo')
base=Path('/opt/bloom-livekit')
base.mkdir(mode=0o700,exist_ok=True)
os.chmod(base,0o700)
credentials=base/'worker-secrets.json'
if credentials.exists():
    values=json.loads(credentials.read_text())
else:
    values={'LIVEKIT_API_KEY':'bloom_'+secrets.token_hex(12),'LIVEKIT_API_SECRET':secrets.token_hex(32)}
values['LIVEKIT_URL']='wss://'+args.domain
credentials.write_text(json.dumps(values))
os.chmod(credentials,0o600)
def image_digest(image):
    return subprocess.check_output(['docker','image','inspect',image,'--format','{{index .RepoDigests 0}}'],text=True).strip()
livekit_image=image_digest('livekit/livekit-server:v1.13.11')
caddy_image=image_digest('livekit/caddyl4:latest')
(base/'livekit.yaml').write_text(f'''port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
  enable_loopback_candidate: false
room:
  auto_create: false
  max_participants: 2
  empty_timeout: 120
  departure_timeout: 20
turn:
  enabled: true
  domain: {args.turn_domain}
  tls_port: 5349
  udp_port: 3478
  external_tls: true
keys:
  {values['LIVEKIT_API_KEY']}: {values['LIVEKIT_API_SECRET']}
logging:
  level: warn
''')
os.chmod(base/'livekit.yaml',0o600)
(base/'caddy.yaml').write_text(f'''logging:
  logs:
    default:
      level: INFO
storage:
  module: file_system
  root: /data
apps:
  tls:
    certificates:
      automate:
        - {args.domain}
        - {args.turn_domain}
  layer4:
    servers:
      main:
        listen: [":443"]
        routes:
          - match:
              - tls:
                  sni: ["{args.turn_domain}"]
            handle:
              - handler: tls
              - handler: proxy
                upstreams:
                  - dial: ["127.0.0.1:5349"]
          - match:
              - tls:
                  sni: ["{args.domain}"]
            handle:
              - handler: tls
                connection_policies:
                  - alpn: ["http/1.1"]
              - handler: proxy
                upstreams:
                  - dial: ["127.0.0.1:7880"]
''')
(base/'compose.yaml').write_text(f'''name: bloom-livekit
services:
  livekit:
    image: {livekit_image}
    command: --config /etc/livekit.yaml
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
  caddy:
    image: {caddy_image}
    command: run --config /etc/caddy.yaml --adapter yaml
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./caddy.yaml:/etc/caddy.yaml:ro
      - ./caddy-data:/data
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
''')
backup=base/'firewall-before-livekit.rules'
if not backup.exists():
    backup.write_bytes(subprocess.check_output(['iptables-save']))
for protocol,ports in [('tcp','80,443,7881'),('udp','3478,50000:50100')]:
    rule=['INPUT','-p',protocol,'-m','multiport','--dports',ports,'-m','comment','--comment','bloom-livekit','-j','ACCEPT']
    if subprocess.run(['iptables','-C',*rule],capture_output=True).returncode:
        subprocess.run(['iptables','-I',rule[0],'1',*rule[1:]],check=True)
rules=Path('/etc/iptables/rules.v4')
if rules.exists():
    rules.write_bytes(subprocess.check_output(['iptables-save']))
subprocess.run(['systemctl','enable','--now','docker'],check=True)
subprocess.run(['docker','compose','-f',str(base/'compose.yaml'),'up','-d'],cwd=base,check=True)
print('BLOOM MED LiveKit deployed. Public endpoint: '+values['LIVEKIT_URL'])
print('Credentials remain in the root-only worker-secrets.json file; do not print them.')
