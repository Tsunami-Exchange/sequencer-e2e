import dotenv from 'dotenv';

export default function globalSetup() {
  console.log('Loading environment variables...');
  dotenv.config();
}
