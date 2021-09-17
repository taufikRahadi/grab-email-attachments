const Imap = require('imap');
const inspect = require('util').inspect;
const { Base64Decode } = require('base64-stream');
const fs = require('fs');
const ins = require('./insert-db');

const email = JSON.parse(fs.readFileSync('./email-v2.json', 'utf-8'));
const processedEmail = email.map(mail => `the-${mail}@ecampus.ut.ac.id`);
processedEmail.forEach(email => {
    const imap = new Imap({
        host: 'outlook.office365.com',
        user: email,
        password: 'Univ2020',
        port: 993,
        tls: true
    });

    const toUpper = thing => thing && thing.toUpperCase ? thing.toUpperCase() : thing;

    const findAttachmentPart = (struct, attachments) => {
        attachments = attachments || [];
        for (let i = 0; i < struct.length; i++) {
            if (Array.isArray(struct[i])) {
                findAttachmentPart(struct[i], attachments);
            } else {
                if (struct[i].disposition && ['INLINE', 'ATTACHMENT'].indexOf(toUpper(struct[i].disposition.type)) > -1) {
                    attachments.push(struct[i]);
                }
            }
        }
        return attachments;
    }

    const buildAttMessageFunction = attachment => {
        const filename = attachment.params.name;
        const encoding = attachment.encoding;

        return (msg, seqno) => {
            const prefix = `(#${seqno})`;
            msg.on('body', (stream, info) => {
                console.log(`${prefix} streaming this attachment to file`, filename, info);
                const splitted = filename.split('_');
                const programStudi = splitted[splitted.length - 1].split('.')[0];
                const matakuliah = splitted[1];
                const nim = splitted[0];
                fs.mkdirSync(`./${programStudi}/${matakuliah}`, {
                    recursive: true
                });
                const filePath = `./${programStudi}/${matakuliah}/${filename}`;
                const writeStream = fs.createWriteStream(filePath);
                writeStream.on('finish', () => console.log(`${prefix} done writing to file %s`, filename));
                ins(filePath, info, filename, nim, programStudi, matakuliah);
                if (toUpper(encoding) === 'BASE64') stream.pipe(new Base64Decode()).pipe(writeStream);
                else stream.pipe(writeStream);
            });

            msg.on('end', () => `${prefix} finished job %s`, filename);
        }
    };

    imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
            if (err) throw err;

            const f = imap.seq.fetch('1:3', {
                bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
                struct: true
            });
            f.on('message', (msg, seqno) => {
                console.log(`message #%d`, seqno);
                const prefix = `(#${seqno})`;
                msg.on('body', (stream, info) => {
                    let buffer = '';
                    stream.on('data', (chunk) => {
                        buffer += chunk.toString('utf-8');
                    });
                    stream.once('end', () => console.log(`${prefix} parsed header : %s`, Imap.parseHeader(buffer)));
                });

                msg.once('attributes', (attrs) => {
                    const attachments = findAttachmentPart(attrs.struct);
                    console.log(`${prefix} has attachments: %d`, attachments.length);

                    for (let i = 0; i < attachments.length; i ++) {
                        const attachment = attachments[i];
                        console.log(`${prefix} fetching attachment %s`, attachment.params.name);
                        const f = imap.fetch(attrs.uid, {
                            bodies: [attachment.partID],
                            struct: true
                        });
                        f.on('message', buildAttMessageFunction(attachment));
                    }
                });
                msg.once('end', () => console.log(`${prefix} finished email`));
            });
            
            f.once('error', (err) => {
                console.log(email);
                console.log(`fetch error: ${err}`)
            });
            f.once('end', () => {
                console.log('done fetching all message'); 
                imap.end();
            });
        });
    });

    imap.once('error', (err) => console.log(err));
    imap.once('end', () => console.log('connection ended'));

    imap.connect();
    });


// // nim_kodemtk_programstudi.pdf || 99999999_MKDU4101_121.pdf || 88888888_MKDU4102_50.pdf
// // prodi ada yg 2 ada yg 3 karakter
// // pertama buat folder prodi berdasarkan kode prodi
// // setelah dapat prodi buat folder kode mtk
// // masukkan file ke dalam folder tsb
// /*
// - 121
//   - MKDU4101
//     - 99999999_MKDU4101_121.pdf
// */
// // masa = 20202, program_studi, kode_mtk, nim
// // cronjob 5 menit
// // flag is read

