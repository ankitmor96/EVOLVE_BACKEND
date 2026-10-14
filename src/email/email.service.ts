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
import { Resend } from 'resend';

@Injectable()
export class EmailService {
    private readonly resend: Resend;

    constructor() {
        const apiKey = process.env.RESEND_API_KEY;

        if (!apiKey) {
            throw new Error('RESEND_API_KEY is missing');
        }

        this.resend = new Resend(apiKey);
    }

    async sendEmailOtp(
        email: string,
        otp: string,
    ): Promise<void> {
        console.log('📧 Sending OTP to:', email);

        try {
            const { data, error } = await this.resend.emails.send({
                from: 'EVOLV <onboarding@resend.dev>',
                to: email,
                subject: 'EVOLV Login OTP',

                html: `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>EVOLV Login Verification</h2>

                        <p>Your login OTP is:</p>

                        <h1 style="letter-spacing: 6px;">
                            ${otp}
                        </h1>

                        <p>This OTP will expire in 5 minutes.</p>

                        <p>
                            If you did not request this OTP,
                            you can safely ignore this email.
                        </p>
                    </div>
                `,
            });

            if (error) {
                console.error('❌ Resend API error:', error);
                throw new Error(error.message);
            }

            console.log('✅ Email sent successfully:', data?.id);
        } catch (error) {
            console.error('❌ Failed to send OTP email:', error);

            throw new InternalServerErrorException(
                'Failed to send OTP email. Please try again later.',
            );
        }
    }
}
