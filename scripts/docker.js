#!/usr/bin/env node

const { execSync } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
    try {
        return execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        process.exit(1);
    }
}

const commands = {
    up: () => {
        log('\nStarting all Hermes services...', 'blue');
        exec('docker-compose up -d');
        log('\nServices started!', 'green');
        log('\nAccess points:', 'cyan');
        log('   Dashboard:  http://localhost:3001', 'cyan');
        log('   API:        http://localhost:3000', 'cyan');
        log('   Collector:  http://localhost:4000', 'cyan');
        log('   PostgreSQL: localhost:5432', 'cyan');
        log('   Redis:      localhost:6379', 'cyan');
        log('\nUse "npm run docker:logs" to see logs', 'yellow');
    },

    down: () => {
        log('\nStopping all services...', 'yellow');
        exec('docker-compose down');
        log('\nServices stopped!', 'green');
    },

    restart: () => {
        log('\nRestarting services...', 'blue');
        exec('docker-compose restart');
        log('\nServices restarted!', 'green');
    },

    logs: () => {
        log('\nShowing logs (Ctrl+C to exit)...', 'blue');
        exec('docker-compose logs -f --tail=100');
    },

    build: () => {
        log('\nBuilding Docker images...', 'blue');
        exec('docker-compose build --no-cache');
        log('\nBuild complete!', 'green');
    },

    rebuild: () => {
        log('\nRebuilding and restarting...', 'blue');
        exec('docker-compose up -d --build');
        log('\nRebuild complete!', 'green');
    },

    status: () => {
        log('\nService status:\n', 'blue');
        exec('docker-compose ps');
    },

    clean: () => {
        log('\nCleaning up (volumes will be preserved)...', 'yellow');
        exec('docker-compose down --remove-orphans');
        log('\nCleanup complete!', 'green');
    },

    destroy: () => {
        log('\nWARNING: This will delete all data!', 'red');
        log('Press Ctrl+C to cancel, or wait 5 seconds...', 'yellow');

        setTimeout(() => {
            log('\nDestroying everything...', 'red');
            exec('docker-compose down -v --remove-orphans');
            log('\nEverything destroyed!', 'green');
        }, 5000);
    },

    shell: () => {
        const service = process.argv[3] || 'api';
        log(`\nOpening shell in ${service}...`, 'blue');
        exec(`docker-compose exec ${service} sh`);
    },

    help: () => {
        log('\nHermes Docker Helper\n', 'blue');
        log('Available commands:', 'cyan');
        log('  up        - Start all services');
        log('  down      - Stop all services');
        log('  restart   - Restart all services');
        log('  logs      - Show logs (streaming)');
        log('  build     - Build Docker images');
        log('  rebuild   - Rebuild and restart');
        log('  status    - Show service status');
        log('  clean     - Stop and remove containers (keep data)');
        log('  destroy   - Stop, remove containers AND delete data');
        log('  shell     - Open shell in service (default: api)');
        log('  help      - Show this help');
        log('\nExamples:', 'yellow');
        log('  node scripts/docker.js up');
        log('  node scripts/docker.js logs');
        log('  node scripts/docker.js shell api');
        log('  node scripts/docker.js shell postgres\n');
    }
};

const command = process.argv[2] || 'help';

if (commands[command]) {
    commands[command]();
} else {
    log(`\nUnknown command: ${command}`, 'red');
    commands.help();
    process.exit(1);
}
