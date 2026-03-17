import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 465,
    secure: true, // Use SSL/TLS
    auth: {
        user: 'admin@n1njanode.com',
        pass: 'n1njamail2026'
    },
    tls: {
        // Do not fail on invalid certs for local testing
        rejectUnauthorized: false
    }
});

async function main() {
    try {
        console.log('Sending email...');
        const info = await transporter.sendMail({
            from: '"Admin Mail" <admin@n1njanode.com>',
            to: 'mail@n1njanode.com',
            subject: 'Direct SMTP Test ' + new Date().getTime(),
            text: 'This is a test of the SMTP connection from the mail server to the local postfix container.',
        });
        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

main();
