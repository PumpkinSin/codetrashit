try {
    require('./modules/bilibili-fetcher');
    require('./modules/zhihu-fetcher');
    require('./modules/zhihu-utils');
    require('./modules/rss-generator');
    console.log('All modules loaded successfully');
    process.exit(0);
} catch (e) {
    console.error('Module load error:', e.message);
    console.error(e.stack);
    process.exit(1);
}
