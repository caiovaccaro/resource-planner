var getReferenceTeamHealth = require('./reference-team-health'),
    getReferenceProjects = require('./reference-projects'),
    getReferenceTeam = require('./reference-team'),
    getReferenceWeeks = require('./reference-weeks'),
    getInputProjects = require('./input-2017-projects');

module.exports = {
    getReferenceTeamHealth: getReferenceTeamHealth,
    getReferenceProjects: getReferenceProjects,
    getReferenceTeam: getReferenceTeam,
    getReferenceWeeks: getReferenceWeeks,
    getInputProjects: getInputProjects,
    getInputs: function(auth) {
        return [
            getReferenceTeamHealth(auth),
            getReferenceTeam(auth),
            getReferenceProjects(auth),
            getInputProjects(auth),
            getReferenceWeeks(auth)
        ]
    }
};