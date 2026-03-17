#!/bin/bash
cat << 'INNER_EOF' > /tmp/mail.n1njanode.com.conf.patch
--- /etc/nginx/sites-available/mail.n1njanode.com
+++ /etc/nginx/sites-available/mail.n1njanode.com
@@ -155,6 +155,14 @@
         proxy_read_timeout 3600;
     }
 
+    location = /oauth2callback {
+        proxy_pass http://127.0.0.1:5009;
+        proxy_http_version 1.1;
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+    }
+
     location / {
         proxy_pass http://127.0.0.1:3050;
         
INNER_EOF
patch /etc/nginx/sites-available/mail.n1njanode.com < /tmp/mail.n1njanode.com.conf.patch
nginx -t && systemctl reload nginx
