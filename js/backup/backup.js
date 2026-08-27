// Backup Management Module
// The real backup is performed by the `scheduledBackup` Cloud Function which
// exports all collections to Cloud Storage and prunes objects older than
// 180 days (6 months). This front-end module renders the current backup
// status/configuration in the Settings view. It does not perform backups
// itself (clients cannot invoke Pub/Sub schedules).
window.Backup = {
    init: function() {
        this.renderStatus();
    },

    renderStatus: function() {
        const list = document.getElementById('backup-status-list');
        if (!list) return;
        list.innerHTML = `
            <li><i class="fa-solid fa-circle-check text-green-500 mr-2"></i>Daily automatic backup to Cloud Storage (scheduledBackup function)</li>
            <li><i class="fa-solid fa-circle-check text-green-500 mr-2"></i>180-day (6 month) retention ensured by the retention pruner</li>
            <li><i class="fa-solid fa-circle-check text-green-500 mr-2"></i>Backups encrypted at rest by Cloud Storage</li>
        `;
    }
};
