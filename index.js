const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ymvsg.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// console.log('uri', uri);

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    // console.log('auth header', authHeader);
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access!' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access!' });
        }
        req.decoded = decoded;
        next();
    });

}


async function run() {
    try {
        await client.connect();
        const partsCollection = client.db('auto-parts').collection('parts');
        const reviewCollection = client.db('auto-parts').collection('reviews');
        const orderCollection = client.db('auto-parts').collection('orders');
        const paymentCollection = client.db('auto-parts').collection('payments');
        const userCollection = client.db('auto-parts').collection('users');

        console.log('all routes should be working')

        // create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const order = req.body;
            const price = order.dollar;
            const amount = price * 100;
            console.log(amount);
            // const paymentIntent = await stripe.paymentIntents.create({
            //     amount: amount,
            //     currency: 'usd',
            //     payment_method_types: ['card']
            // });

            // console.log(paymentIntent)


            // res.send({ clientSecret: paymentIntent.client_secret })
            // console.log('client secret', clientSecret);
        })

        // verify admin function
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'Forbidden access!' });
            }
        }

        // load all parts
        app.get('/parts', async (req, res) => {
            const result = await partsCollection.find().toArray();
            res.send(result);
        })

        // add product
        app.post('/parts', async (req, res) => {
            const product = req.body;
            const result = await partsCollection.insertOne(product);
            res.send(result);
        })

        // delete product
        app.delete('/parts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await partsCollection.deleteOne(query);
            res.send(result);
        })

        // load all reviews
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // post user review
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })

        // load clicked item 
        app.get('/parts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await partsCollection.findOne(query);
            // console.log('loaded clicked item')
            res.send(result);
        })


        // post order
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        })

        // get all orders
        app.get('/orders', async (req, res) => {
            // console.log('orders')
            const result = await orderCollection.find().toArray();
            res.send(result);
        })

        // get orders by email
        app.get('/my_orders', verifyJWT, async (req, res) => {
            const user = req.query.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail === user) {
                const filter = { email: user };
                const cursor = orderCollection.find(filter);
                const result = await cursor.toArray();
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access!' });
            }
        })




        // load order for payment
        app.get('/orders/:id', async (req, res) => {
            console.log('orders id')
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.findOne(query);
            res.send(result);
        })



        // update payment 
        app.patch('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        // make shipping
        app.put('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const deliver = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: deliver
            };
            const result = await orderCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })


        // delete order
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })

        // add user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            console.log('token', token);
            res.send({ result, token });
        })

        // update user info
        app.patch('/user/:email', async (req, res) => {
            const email = req.params.email;
            const userInfo = req.body;
            const filter = { email: email };
            const updateDoc = {
                $set: userInfo
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // load particular user info
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            res.send(result);
        })

        // check if admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        // get all users
        app.get('/users', async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        // make admin
        app.put('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' }
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' });
            }
        })




    }
    finally {

    }
}

run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello from server side!');
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
})