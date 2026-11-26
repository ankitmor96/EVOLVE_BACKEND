// import { Injectable } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';

// @Injectable()
// export class EmailService {
//     private transporter = nodemailer.createTransport({
//         host: process.env.SMTP_HOST,
//         port: Number(process.env.SMTP_PORT),
//         secure: process.env.SMTP_SECURE === 'true',

//         auth: {
//             user: process.env.SMTP_USER,
//             pass: process.env.SMTP_PASSWORD,
//         },
//     });

//     async sendEmailOtp(
//         email: string,
//         otp: string,
//     ) {
//         console.log('📧 Sending OTP to:', email);

//         const info = await this.transporter.sendMail({
//             from: process.env.SMTP_FROM,
//             to: email,
//             subject: 'EVOLV Login OTP',

//             html: `
//                 <div style="font-family: Arial, sans-serif;">
//                     <h2>EVOLV Login Verification</h2>

//                     <p>Your login OTP is:</p>

//                     <h1 style="letter-spacing: 6px;">
//                         ${otp}
//                     </h1>

//                     <p>
//                         This OTP will expire in 5 minutes.
//                     </p>

//                     <p>
//                         If you did not request this OTP,
//                         you can safely ignore this email.
//                     </p>
//                 </div>
//             `,
//         });

//         console.log('✅ Email sent:', info.messageId);
//     }
// }






import {
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';

import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class EmailService {
    private readonly brevo: BrevoClient;

    constructor() {
        const apiKey = process.env.BREVO_API_KEY;

        if (!apiKey) {
            throw new Error('BREVO_API_KEY is missing');
        }

        this.brevo = new BrevoClient({ apiKey });
    }

    async sendEmailOtp(
        email: string,
        otp: string,
    ): Promise<void> {
        console.log('📧 Sending OTP to:', email);

        try {
            const senderEmail = process.env.BREVO_SENDER_EMAIL;

            if (!senderEmail) {
                throw new Error('BREVO_SENDER_EMAIL is missing');
            }

            const logoUrl = process.env.EVOLV_EMAIL_LOGO_URL;
            const websiteUrl =
                process.env.EVOLV_WEBSITE_URL || 'https://evolvs.in';

            if (!logoUrl) {
                throw new Error('EVOLV_EMAIL_LOGO_URL is missing');
            }

            const safeOtp = String(otp).replace(/[&<>"']/g, '');

            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVOLV Login Verification</title>
</head>

<body style="
    margin:0;
    padding:0;
    background-color:#ffffff;
    font-family:Arial, Helvetica, sans-serif;
    color:#171717;
">

<table width="100%" cellpadding="0" cellspacing="0"
    border="0" style="background-color:#ffffff;">

    <tr>
        <td align="center" style="padding:24px 15px;">

            <table width="100%" cellpadding="0" cellspacing="0"
                border="0" style="max-width:650px;">

                <!-- EVOLV LOGO -->
                <tr>
                    <td style="padding:10px 15px 24px;">

                        <a href="${websiteUrl}"
                            style="text-decoration:none;">

                            <img
                                src="${logoUrl}"
                                alt="EVOLV - A Human Growth Network"
                                width="280"
                                style="
                                    display:block;
                                    width:100%;
                                    max-width:280px;
                                    height:auto;
                                    border:0;
                                "
                            />

                        </a>

                    </td>
                </tr>

                <!-- TOP DIVIDER -->
                <tr>
                    <td style="
                        border-top:1px solid #dddddd;
                        font-size:0;
                        line-height:0;
                    ">
                        &nbsp;
                    </td>
                </tr>

                <!-- EMAIL CONTENT -->
                <tr>
                    <td style="padding:32px 15px 28px;">

                        <h1 style="
                            font-size:26px;
                            line-height:1.3;
                            font-weight:700;
                            margin:0 0 18px;
                            color:#171717;
                        ">
                            Hi!
                        </h1>

                        <h2 style="
                            font-size:24px;
                            line-height:1.3;
                            font-weight:700;
                            margin:0 0 20px;
                            color:#111111;
                        ">
                            EVOLV Login Verification
                        </h2>

                        <p style="
                            font-size:15px;
                            line-height:1.6;
                            margin:0 0 22px;
                            color:#333333;
                        ">
                            Someone tried to log in to your EVOLV account.
                            If it was you, enter this confirmation code in the app:
                        </p>

                        <!-- OTP BOX -->
                        <table width="100%" cellpadding="0" cellspacing="0"
                            border="0">

                            <tr>
                                <td align="center" style="
                                    background-color:#f0e8ff;
                                    border-radius:18px;
                                    padding:16px 10px;
                                ">

                                    <span style="
                                        font-size:32px;
                                        line-height:1.3;
                                        font-weight:700;
                                        letter-spacing:8px;
                                        color:#000000;
                                    ">
                                        ${safeOtp}
                                    </span>

                                </td>
                            </tr>

                        </table>

                        <p style="
                            font-size:14px;
                            line-height:1.5;
                            margin:25px 0 18px;
                            color:#333333;
                        ">
                            This code is valid for 5 minutes.
                        </p>

                        <p style="
                            font-size:14px;
                            line-height:1.5;
                            margin:0;
                            color:#333333;
                        ">
                            If you didn't request this login, you can
                            safely ignore this email.
                        </p>

                    </td>
                </tr>

                <!-- FOOTER DIVIDER -->
                <tr>
                    <td style="
                        border-top:1px solid #dddddd;
                        font-size:0;
                        line-height:0;
                    ">
                        &nbsp;
                    </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                    <td style="padding:22px 15px 28px;">

                        <p style="
                            font-size:14px;
                            line-height:1.5;
                            margin:0 0 8px;
                            color:#333333;
                        ">
                            Best regards,
                        </p>

                        <p style="
                            font-size:18px;
                            line-height:1.4;
                            font-weight:700;
                            margin:0 0 38px;
                            color:#111111;
                        ">
                            Team EVOLV
                        </p>

                        <p align="center" style="
                            font-size:13px;
                            line-height:1.5;
                            margin:0;
                            color:#777777;
                        ">

                            <a href="${websiteUrl}" style="
                                color:#7136d9;
                                font-weight:700;
                                text-decoration:none;
                            ">
                                evolvs.in
                            </a>

                            &nbsp; • &nbsp; A Human Growth Network

                        </p>

                    </td>
                </tr>

            </table>

        </td>
    </tr>

</table>

</body>
</html>
`;

            const result =
                await this.brevo.transactionalEmails.sendTransacEmail({
                    sender: {
                        name: 'EVOLV',
                        email: senderEmail,
                    },

                    to: [{ email }],

                    subject: 'EVOLV Login Verification',

                    htmlContent,
                });

            console.log(
                '✅ Brevo accepted OTP email:',
                result,
            );

        } catch (error) {
            console.error('❌ Brevo email error:', error);

            throw new InternalServerErrorException(
                'Failed to send OTP email',
            );
        }
    }
}
