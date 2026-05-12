#!/usr/bin/env node

/**
 * Docker Management Helper
 * Facilita comandos comuns do Docker Compose
 */

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
        log('\n🚀 Starting all Hermes services...', 'blue');
        exec('docker-compose up -d');
        log('\n✅ Services started!', 'green');
        log('\n📍 Access points:', 'cyan');
        log('   Dashboard:  http://localhost:3001', 'cyan');
        log('   API:        http://localhost:3000', 'cyan');
        log('   Collector:  http://localhost:4000', 'cyan');
        log('   PostgreSQL: localhost:5432', 'cyan');
        log('   Redis:      localhost:6379', 'cyan');
        log('\n💡 Use "npm run docker:logs" to see logs', 'yellow');
    },

    down: () => {
        log('\n🛑 Stopping all services...', 'yellow');
        exec('docker-compose down');
        log('\n✅ Services stopped!', 'green');
    },

    restart: () => {
        log('\n🔄 Restarting services...', 'blue');
        exec('docker-compose restart');
        log('\n✅ Services restarted!', 'green');
    },

    logs: () => {
        log('\n📋 Showing logs (Ctrl+C to exit)...', 'blue');
        exec('docker-compose logs -f --tail=100');
    },

    build: () => {
        log('\n🔨 Building Docker images...', 'blue');
        exec('docker-compose build --no-cache');
        log('\n✅ Build complete!', 'green');
    },

    rebuild: () => {
        log('\n🔨 Rebuilding and restarting...', 'blue');
        exec('docker-compose up -d --build');
        log('\n✅ Rebuild complete!', 'green');
    },

    status: () => {
        log('\n📊 Service status:\n', 'blue');
        exec('docker-compose ps');
    },

    clean: () => {
        log('\n🧹 Cleaning up (volumes will be preserved)...', 'yellow');
        exec('docker-compose down --remove-orphans');
        log('\n✅ Cleanup complete!', 'green');
    },

    destroy: () => {
        log('\n⚠️  WARNING: This will delete all data!', 'red');
        log('Press Ctrl+C to cancel, or wait 5 seconds...', 'yellow');
        
        setTimeout(() => {
            log('\n🗑️  Destroying everything...', 'red');
            exec('docker-compose down -v --remove-orphans');
            log('\n✅ Everything destroyed!', 'green');
        }, 5000);
    },

    shell: () => {
        const service = process.argv[3] || 'api';
        log(`\n🐚 Opening shell in ${service}...`, 'blue');
        exec(`docker-compose exec ${service} sh`);
    },

    help: () => {
        log('\n📖 Hermes Docker Helper\n', 'blue');
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
    log(`\n❌ Unknown command: ${command}`, 'red');
    commands.help();
    process.exit(1);
}
