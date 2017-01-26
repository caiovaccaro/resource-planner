var google = require('googleapis');
var spreadsheetId = '1uwqxl9tinbUG79m_O1ONg6R5AzrjEzgcPDxt2gwe86Q';
var range = '2017 Reference Team Data!A1:AB54';
var data = [];

module.exports = function (auth) {
  return fetchData(auth, function(rows) {
      return getRawData(rows);
  });
}

function fetchData(auth, callback) {
    var sheets = google.sheets('v4');

    return new Promise(function(resolve, reject) {
        sheets.spreadsheets.values.get({
            auth: auth,
            spreadsheetId: spreadsheetId,
            range: range,
        }, function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err);
                return;
            }

            var rows = response.values;

            if (rows.length == 0) {
                console.log('No data found.');
                reject('No data found.');
            } else {
                resolve(callback(rows));
            }
        });
    });
}

function getRawData(rows) {
    return new Promise(function(resolve, reject) {
        var first = rows[0].join()
        var headers = first.split(',');
        
        var jsonData = [];
        for ( var i = 1, length = rows.length; i < length; i++ )
        {
            var myRow = rows[i].join();
            var row = myRow.split(',');
            
            var data = {};
            for ( var x = 0; x < row.length; x++ )
            {
            data[headers[x]] = row[x];
            }
            jsonData.push(data);
        }
        
        resolve(jsonData);
    });
}