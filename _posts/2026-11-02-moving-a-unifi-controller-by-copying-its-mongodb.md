---
layout: post
title: "Moving an old UniFi controller to Docker by copying its MongoDB"
date: 2026-11-02 12:25:00 +0100
categories: unifi mongodb docker homelab linux
---

I had this VPS laying around that I wanted to kill, especially since it wasn't updated since a while and with AI revealing more and more CVEs, having unmaintained Archlinux VPS exposed to the internet, is.. not smart.

The last thing on it was an old UniFi controller, version 7.2 (4 years old haha). It manages the only access point we have at home, a UAP-AC-Lite. Not much, but nice to keep around.

I knew that the AP would keep working without its controller (it keeps its last config), but I wanted to keep an eye on it. The controller has to move to my home server, in Docker, next to Home Assistant.

# Docker side

Nothing fancy. I picked [jacobalberty/unifi](https://hub.docker.com/r/jacobalberty/unifi) because it comes with MongoDB in the same image:

```yaml
services:
  unifi:
    image: jacobalberty/unifi:v10.0.162
    container_name: unifi
    network_mode: host
    environment:
      - TZ=Europe/Paris
    volumes:
      - ./data:/unifi
    restart: unless-stopped
```

(host networking because simplicity of not having to bother with port mapping).

# Backup & restore

The normal way is to download a `.unf` backup from the old controller and restore it in the new one. However for some reason (might be linked to the dead SSL cert, who knows), I couldn't create a new backup and download it, it just hang. Anyway, I had to find another way, and this is what this blog post is really about.

While poking, I noticed the old MongoDB answers on `127.0.0.1:27117` with no password at all (yikes), and the whole database is around 20 MB. As the new 10.0 image still comes with MongoDB 3.6, the software engineer in me thinks, why not just copy the data over?

# Copying the database

Unexpectedly, the VPS has the `mongo` shell but no `mongodump`, and the home server can't SSH into the VPS. My laptop can reach both though, so let's use it as the bridge.

Here's what ended up working. On the home server everything lives in `~/unifi`, and the files in `data/` are owned by root, hence the `sudo`.

First, on the home server, stop the controller and move the fresh database out of the way:

```bash
cd ~/unifi && docker compose stop
sudo mv data/data/db data/data/db.fresh-install
sudo mkdir data/data/db
```

Then start a temporary `mongod` on that empty directory, with the official `mongo:3.6` image since it has `mongodump` and `mongorestore`:

```bash
docker run -d --name unifi-db-import --network host \
  -v "$HOME/unifi/data/data/db:/data/db" \
  mongo:3.6 --bind_ip 127.0.0.1 --port 27119
```

From the laptop, creating the tunnel and the transfer. I only take `ace` (the config) and `ace_stat` (the stats):

```bash
# laptop:27118 -> VPS:27117
ssh -f -N -L 27118:127.0.0.1:27117 old-vps

# home-server:27118 -> laptop:27118, then dump and restore in one go
ssh -R 27118:127.0.0.1:27118 home-server \
  'docker exec unifi-db-import sh -c "mongodump --host 127.0.0.1 --port 27118 --archive \
     | mongorestore --host 127.0.0.1 --port 27119 --archive \
         --nsInclude \"ace.*\" --nsInclude \"ace_stat.*\""'
```

Quoting is ugly but it worked!

Back on the home server: stop the temporary `mongod`, tell UniFi which version the data really comes from, and start the controller:

```bash
docker stop unifi-db-import && docker rm unifi-db-import
printf 7.2.95 | sudo tee data/data/db/version
docker compose start
```

See this in the logs:

```
INFO  migration - DB migration to version (10.0.162) is complete.
```

Repoint the AP by SSHing into it (the credentials are in the controller settings, under Device SSH Authentication) and settingz the new controller:

```
set-inform http://192.168.1.1:8080/inform
```

I thought I would need to adopt it again, but no: the device's auth key came along with the database, so the AP just showed up a minute later, clients and all.

# Actually the first attempt failed

My first attempt more naive: import on top of the fresh 10.0 install with `mongorestore --drop`, then start the controller. It started, but the log said:

```
INFO  migration - Version 10.0.162 has not changed, skipping migration
```

It seems UniFi doesn't check the data to know where the schema is at (yikes again). It reads a text file, `db/version`, and the fresh install had already written `10.0.162` in there. So it skipped the migration entirely. Putting `7.2.95` in that file got it going.

Which then failed:

```
ERROR migration - Migration failed: 'Rename collection from admin_access_log to admin_activity_log':
'Command failed with error 48 (NamespaceExists): 'target namespace exists'
```

`--drop` only drops the collections that are in the dump. The fresh install had already created `admin_activity_log` (which doesn't exist in 7.2), so when the migration wanted to rename the old collection to that name, it was taken. The rest of the migration went through, but I didn't trust a half-migrated database, so I started over, and it worked.

# That's it!

VPS deleted, controller on the LAN, AP happy. Would the backup route have been quicker? Probably. But at least now I know UniFi keeps its schema version in a text file ;)
