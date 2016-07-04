# mongro

quick mongodb RESTful API

usage (will add more if there is interest):

run with node ./lib/server --express.port=[port]

use any method for these endpoints:

/db/:db_name/collection/:collection_name/method/:method

method corresponds with any of the following from the Node.js MongoDB driver:

-find
-findOne
-findOneAndUpdate
-findOneAndReplace
-findOneAndRemove
-deleteOne
-deleteMany
-insertOne
-insertMany
-updateOne
-updateMany

pass options to the request query or body (body is better as it will probably cast options to their appropriate type)

## License
Copyright (c) 2016 Ben Sack  
Licensed under the MIT license.
