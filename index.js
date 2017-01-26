var google = require('googleapis'),
    auth = require('./auth.js'),
    _ = require('lodash'),
    moment = require('moment'),
    math = require('mathjs'),
    getReferenceTeamHealth = require('./services/reference-team-health'),
    getReferenceProjects = require('./services/reference-projects'),
    getReferenceTeam = require('./services/reference-team'),
    getReferenceWeeks = require('./services/reference-weeks'),
    getInputProjects = require('./services/input-2017-projects'),
    weeks = [],
    team = [],
    teamMatrix = [],
    projectsMatrix = [],
    teamCareerMatrix = [],
    teamExperienceMatrix = [];


auth()
    .then(function(auth) {
        Promise.all([
                getReferenceTeamHealth(auth),
                getReferenceTeam(auth),
                getReferenceProjects(auth),
                getInputProjects(auth),
                getReferenceWeeks(auth)
            ])
            .then(buildWeeksArray)
            .then(calculateReferenceWeeks)
            .then(calculateInputWeeks)
            .then(function(data) {
                return fillWeeksReference(data, auth);
            })
            .then(function(data) {
                return fillWeeksInput(data, auth);
            })
            .then(calculateFinalDates)
            .then(function(data) {
                return fillWeeksDatesInput(data, auth);
            })
            .then(calculateProjects)
            .then(buildProjectsTeamOutputMatrix)
            .then(buildProjectsOutputMatrix)
            .then(buildTeamCareerOutputMatrix)
            .then(buildTeamExperienceOutputMatrix)
            .then(function() {
                return fillTeamOutput(auth);
            })
            .then(function() {
                return fillProjectsOutput(auth);
            })
            .then(function() {
                return fillTeamScoreOutput(auth);
            })
            .then(function() {
                return fillTeamExperienceOutput(auth);
            });
    });


/**
 * Build weeks "database"
 * like:
 *  weeks [
 *      {
 *          weekNumber:
 *          weekDate:
 *          team: { TD, DoE, TA... }
 *          projects: { Num of... }
 *      }
 *  ]
 */
function buildWeeksArray(data) {
    var team = _.map(data[1], 'ID');
    var projectTypes = _.filter(_.uniq(_.map(data[2], 'Project Type')), function(type) {
        return type.length;
    });

    _.each(data[4], function(week) {
        week.team = {};
        week.projects = {};
        _.each(team, function(id) {
            week.team[id] = 0;
        });
        _.each(projectTypes, function(type) {
            week.projects['Num of ' + type] = 0;
        })

        weeks.push(week);
    });

    // console.log(weeks);

    return Promise.resolve(data);
}

/**
 * See which and how many projects on that week
 * Get the team for each, sum
 * Fill team and projects for each week
 * 
 * For each project
 *  get the start date and the num of weeks
 *  for each week
 *      push the team and project data
 **/
function calculateProjects() {
    return new Promise(function(resolve, reject) {
        auth()
            .then(getInputProjects)
            .then(function(data) {
                _.each(data, function(project) {
                    if (project['Start']) {
                        var projectStart = project['Start'],
                            startWeek = moment(projectStart).week(),
                            numOfWeeks = project['Num of weeks'],
                            numOfWeeksInteger = parseInt(numOfWeeks, 10),
                            i = 0,
                            index, week;

                        if (numOfWeeks) {
                            for(i; i < numOfWeeksInteger; i++) {
                                if (moment(projectStart).add(i, 'weeks').year() < 2018) {
                                    index = startWeek + i - 1;
                                    week = weeks[index];

                                    (function(week, project) {
                                        week.projects['Num of ' + project['Type']] += 1;
                                        _.each(week.team, function(value, key) {
                                            week.team[key] += parseInt(project[key], 10);
                                        });
                                    })(week, project);
                                }
                            }
                        }
                    }
                });
                resolve(weeks);
            });
    })
}

function buildProjectsTeamOutputMatrix(weeks) {
    _.each(weeks, function(week) {
        var row = [];

        _.each(week.team, function(value, key) {
            row.push(value);
        })

        teamMatrix.push(row);
    })

    return Promise.resolve(weeks);
}

function buildProjectsOutputMatrix(weeks) {
    _.each(weeks, function(week) {
        var row = [];

        _.each(week.projects, function(value, key) {
            row.push(value);
        })

        projectsMatrix.push(row);
    })

    return Promise.resolve(weeks);
}

function getResources(week) {
    var types = [];

    _.each(week.team, function(value, key) {
        var resource = _.find(team, { ID: key }),
            resourceType = resource['Type'],
            i = 0;

        if (value > 0 && resourceType) {
            for (i; i <= value; i++) {
                types.push(resourceType);
            }
        }
    });

    return types;
}

function getNumberOfExecutionResources(week) {
    return _.filter(getResources(week), function(type) {
        return type !== 'L' && type !== 'TA'
    }).length;
}

function getNumberOfLeadershipResources(week) {
    return _.filter(getResources(week), function(type) {
        return type === 'L' || type === 'TA'
    }).length;
}

function getNumberOfTAResources(week) {
    return _.filter(getResources(week), function(type) {
        return type === 'TA'
    }).length;
}

/**
 * For each week
 *  get each type of resource
 *      and multiply its number by each level score
 *      add to the respective A,M,S,L,TA under execution or leadership
 *      calculate the median of A,M,S,L,TA by execution and leadership
 */
function buildTeamCareerOutputMatrix(weeks) {
    var i = j = k = l = 0,
        length = weeks.length,
        row, prop, resource, resourceQty, resourceType;

    for (i; i < length; i++) {
        week = weeks[i];

        row = [];

        row[0] = 0;
        row[1] = 0;
        row[2] = 0;
        row[3] = 0;
        row[4] = 0;

        var medianA = [],
            medianM = [],
            medianS = [],
            medianL = [],
            medianTA = [];

        for (prop in week.team) {
            resourceQty = week.team[prop];

            if (resourceQty > 0) {
                resource = _.find(team, { ID: prop });
                resourceType = resource['Type'];

                if (resourceType === 'L' || resourceType === 'TA') {
                    for (j; j < resourceQty; j++) {
                        medianL.push(parseFloat(resource['L Score']));
                    }
                    for (k; k < resourceQty; k++) {
                        medianTA.push(parseFloat(resource['TA Score']));
                    }
                } else if (resourceType) {
                    for (j; j < resourceQty; j++) {
                        medianA.push(parseFloat(resource['A Score']));
                    }
                    for (k; k < resourceQty; k++) {
                        medianM.push(parseFloat(resource['M Score']));
                    }
                    for (l; l < resourceQty; l++) {
                        medianS.push(parseFloat(resource['S Score']));
                    }
                }
            }
        }

        row[0] = medianA.length ? math.median(medianA) : 0;
        row[1] = medianM.length ? math.median(medianM) : 0;
        row[2] = medianS.length ? math.median(medianS) : 0;
        row[3] = medianL.length ? math.median(medianL) : 0;
        row[4] = medianTA.length ? math.median(medianTA) : 0;

        teamCareerMatrix.push(row);
    }

    return Promise.resolve(weeks);
}

/**
 * For each week
 *  get each type of resource
 *      and multiply its number by the respective exp score
 *      sum each type of experience and add to the week
 */
function buildTeamExperienceOutputMatrix(weeks) {
    var i = j = k = l = m = n = o = p = q = r = s = t = u = v = x = y = 0,
        length = weeks.length,
        row, expClientInterface, expClientUIApplication, expClientCreative,
        expClientNoUIApplication, expPlatformEcommerce, expPlatformCMS,
        expEmergingPlatforms, expServerDirect, expServerEnterprise,
        expMobileNative, expMobileHybrid, expInfrastructureDirect,
        expInfrastructureEnterprise, expDataAnalysis, expDataVisualization,
        prop, resource, resourceQty, resourceType;

    for (i; i < length; i++) {
        week = weeks[i];

        row = [];

        row[0] = 0;
        row[1] = 0;
        row[2] = 0;
        row[3] = 0;
        row[4] = 0;
        row[5] = 0;
        row[6] = 0;
        row[7] = 0;
        row[8] = 0;
        row[9] = 0;
        row[10] = 0;
        row[11] = 0;
        row[12] = 0;
        row[13] = 0;

        expClientInterface = [];
        expClientUIApplication = [];
        expClientCreative = [];
        expClientNoUIApplication = [];
        expPlatformEcommerce = [];
        expPlatformCMS = [];
        expEmergingPlatforms = [];
        expServerDirect = [];
        expServerEnterprise = [];
        expMobileNative = [];
        expMobileHybrid = [];
        expInfrastructureDirect = [];
        expInfrastructureEnterprise = [];
        expDataAnalysis = [];
        expDataVisualization = [];

        for (prop in week.team) {
            var resourceQty = week.team[prop];

            if (resourceQty > 0) {
                resource = _.find(team, { ID: prop });
                resourceType = resource['Type'];

                if (resourceType && resourceType !== 'L') {
                    for (j; j < resourceQty; j++) {
                        expClientInterface.push(parseFloat(resource['Exp Client Interface']));
                    }
                    for (k; k < resourceQty; k++) {
                        expClientUIApplication.push(parseFloat(resource['Exp Client UI Application']));
                    }
                    for (y; y < resourceQty; y++) {
                        expClientCreative.push(parseFloat(resource['Exp Client Creative']));
                    }
                    for (l; l < resourceQty; l++) {
                        expClientNoUIApplication.push(parseFloat(resource['Exp Client No-UI Application']));
                    }
                    for (m; m < resourceQty; m++) {
                        expPlatformEcommerce.push(parseFloat(resource['Exp Platform Ecommerce']));
                    }
                    for (n; n < resourceQty; n++) {
                        expPlatformCMS.push(parseFloat(resource['Exp Platform CMS']));
                    }
                    for (o; o < resourceQty; o++) {
                        expEmergingPlatforms.push(parseFloat(resource['Exp Emerging Platforms']));
                    }
                    for (p; p < resourceQty; p++) {
                        expServerDirect.push(parseFloat(resource['Exp Server Direct']));
                    }
                    for (q; q < resourceQty; q++) {
                        expServerEnterprise.push(parseFloat(resource['Exp Server Enterprise']));
                    }
                    for (r; r < resourceQty; r++) {
                        expMobileNative.push(parseFloat(resource['Exp Mobile Native']));
                    }
                    for (s; s < resourceQty; s++) {
                        expMobileHybrid.push(parseFloat(resource['Exp Mobile Hybrid']));
                    }
                    for (t; t < resourceQty; t++) {
                        expInfrastructureDirect.push(parseFloat(resource['Exp Infrastructure Direct']));
                    }
                    for (u; u < resourceQty; u++) {
                        expInfrastructureEnterprise.push(parseFloat(resource['Exp Infrastructure Enterprise']));
                    }
                    for (v; v < resourceQty; v++) {
                        expDataAnalysis.push(parseFloat(resource['Exp Data Analysis']));
                    }
                    for (x; x < resourceQty; x++) {
                        expDataVisualization.push(parseFloat(resource['Exp Data Visualization']));
                    }
                }
            }
        }

        row[0] = expClientInterface.length ? math.median(expClientInterface) : 0;
        row[1] = expClientUIApplication.length ? math.median(expClientUIApplication) : 0;
        row[2] = expClientCreative.length ? math.median(expClientCreative) : 0;
        row[3] = expClientNoUIApplication.length ? math.median(expClientNoUIApplication) : 0;
        row[4] = expPlatformEcommerce.length ? math.median(expPlatformEcommerce) : 0;
        row[5] = expPlatformCMS.length ? math.median(expPlatformCMS) : 0;
        row[6] = expEmergingPlatforms.length ? math.median(expEmergingPlatforms) : 0;
        row[7] = expServerDirect.length ? math.median(expServerDirect) : 0;
        row[8] = expServerEnterprise.length ? math.median(expServerEnterprise) : 0;
        row[9] = expMobileNative.length ? math.median(expMobileNative) : 0;
        row[10] = expMobileHybrid.length ? math.median(expMobileHybrid) : 0;
        row[11] = expInfrastructureDirect.length ? math.median(expInfrastructureDirect) : 0;
        row[12] = expInfrastructureEnterprise.length ? math.median(expInfrastructureEnterprise) : 0;
        row[13] = expDataAnalysis.length ? math.median(expDataAnalysis) : 0;
        row[14] = expDataVisualization.length ? math.median(expDataVisualization) : 0;

        teamExperienceMatrix.push(row);
    }

    return Promise.resolve(weeks);
}

function calculateReferenceWeeks(data) {
    team = data[1];

    return new Promise(function(resolve, reject) {
        var ids = _.map(data[1], 'ID'),
            weeksColumn = [],
            i = 1,
            length = data[2].length,
            project, weeks, teamSum;
        
        for(i; i < length; i++) {
            project = data[2][i];
            weeks = [];
            teamSum;

            teamSum = _.reduce(ids, function(sum, id) {
                var resource = _.find(data[1], { ID: id }),
                    resourceQty = project[id] > 0 ? project[id] : 0,
                    op = resource['P. Operator'] === '*' ? 
                            parseInt(resourceQty, 10) * parseFloat(resource['P. Factor']) :
                            parseInt(resourceQty, 10) / parseFloat(resource['P. Factor']);

                return sum + op;
            }, 0);

            weeks[0] = Math.ceil(teamSum > 0 ? (project['Num of templates'] / teamSum) * project['Complexity'] : 0);
            weeksColumn.push(weeks);
        };
        resolve([data, weeksColumn]);
    });
}

function calculateInputWeeks(data) {
    return new Promise(function(resolve, reject) {
        var ids = _.map(data[0][1], 'ID'),
            weeksColumn = [],
            i = 0,
            length = data[0][3].length,
            teamSum, weeks;

        for(i; i < length; i++) {
            project = data[0][3][i];
            weeks = [];

            teamSum = _.reduce(ids, function(sum, id) {
                var resource = _.find(data[0][1], { ID: id }),
                    resourceQty = project[id] > 0 ? project[id] : 0,
                    op = resource['P. Operator'] === '*' ? 
                            parseInt(resourceQty, 10) * parseFloat(resource['P. Factor']) :
                            parseInt(resourceQty, 10) / parseFloat(resource['P. Factor']);
                
                return sum + op;
            }, 0);

            weeks[0] = Math.ceil(teamSum > 0 ? (project['Num of templates'] / teamSum) * project['Complexity'] : 0);
            weeksColumn.push(weeks);
        };
        
        resolve({ weeksReference: data[1], weeksInput: weeksColumn });
    });
}

function calculateFinalDates(data) {
    return new Promise(function(resolve, reject) {
        auth()
            .then(getInputProjects)
            .then(function(data) {
                var datesColumn = [],
                    i = 0,
                    length = data.length,
                    project, date;

                for(i; i < length; i++) {
                    project = data[i];
                    date = [];
                    
                    date[0] = moment(project['Start']).add(parseInt(project['Num of weeks'], 10), 'weeks').format('l');
                    datesColumn.push(date);
                };
                
                resolve(datesColumn);
            });
        });
}

function fillWeeksReference(data, auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Reference Projects Forecast Data!K3:K111',
            valueInputOption: 'RAW',
            resource: {
                values: data.weeksReference
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve(data);
            }
        });
    });
}

function fillWeeksInput(data, auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Projects Input!M3:M36',
            valueInputOption: 'RAW',
            resource: {
                values: data.weeksInput
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve();
            }
        });
    });
}

function fillWeeksDatesInput(data, auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Projects Input!B3:B36',
            valueInputOption: 'RAW',
            resource: {
                values: data
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve(data);
            }
        });
    });
}

function fillTeamOutput(auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Output!D3:BD54',
            valueInputOption: 'RAW',
            resource: {
                values: teamMatrix
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve();
            }
        });
    });
}

function fillProjectsOutput(auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Output!CD3:CV54',
            valueInputOption: 'RAW',
            resource: {
                values: projectsMatrix
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve();
            }
        });
    });
}

function fillTeamScoreOutput(auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Output!BG3:BK54',
            valueInputOption: 'RAW',
            resource: {
                values: teamCareerMatrix
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve();
            }
        });
    });
}

function fillTeamExperienceOutput(auth) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {        
        sheets.spreadsheets.values.update({
            auth: auth,
            spreadsheetId: '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q',
            range: '2017 Planned Output!BN3:CB54',
            valueInputOption: 'RAW',
            resource: {
                values: teamExperienceMatrix
            }
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            } else {
                resolve();
            }
        });
    });
}