try {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.log('DATABASE_URL is not set!');
    } else {
        const parsed = new URL(url);
        console.log('DATABASE_URL Protocol:', parsed.protocol);
        console.log('DATABASE_URL Host:', parsed.host);
    }
} catch (e) {
    console.log('DATABASE_URL is invalid or could not be parsed.');
}
