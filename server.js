const axios = require("axios").default
const base64 = require("base-64")
const dotenv = require("dotenv").config()
const express = require("express")
const uuid = require("uuid")

const paypal_client_id =
    process.env.PAYPAL_LIVE_CLIENT_ID || process.env.PAYPAL_SANDBOX_CLIENT_ID || null
const paypal_secret =
    process.env.PAYPAL_LIVE_SECRET || process.env.PAYPAL_SANDBOX_SECRET || null
const port = process.env.port || 3000

const app = express()
app.set("view engine", "ejs")
app.use("/static", express.static(__dirname + "/views/"))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let paypal_access_token = null
// Number of seconds to wait before checking for the paypal_access_token
let access_token_interval = 3600

let cart = []
let purchased = []
let errors = []
const SHIPPING_PRICE = 10
const customer = {
    first_name: "John",
    last_name: "Smith",
    address_1: "Room X, Flat Y",
    address_2: "99 Smith Street",
    address_3: null,
    postal_code: "X99 9XX",
    email: "john@smith.com",
    telephone: "+441234567890",
}
const items = [
    {
        id: 1,
        name: "ASUS RTX 2060",
        description:
            "ASUS Phoenix GeForce RTX™ 2060 6GB GDDR6 with the new NVIDIA Turing™ GPU architecture.",
        price: 420.0,
        quantity: 1,
        image: "/static/assets/images/asus-rtx-2060.jpg",
    },
    {
        id: 2,
        name: "GTX Titan X",
        description:
            "The NVIDIA TITAN X, featuring the NVIDIA Pascal™ architecture, is the ultimate graphics card. Whatever you're doing, this groundbreaking TITAN X gives you the power to accomplish things you never thought possible.",
        price: 500.0,
        quantity: 1,
        image: "/static/assets/images/gtx-titan-x.jpg",
    },
    {
        id: 3,
        name: "MSI GTX 1050",
        description: "GeForce MSI GTX 1050.",
        price: 130.0,
        quantity: 0,
        image: "/static/assets/images/msi-gtx-1050.jpg",
    },
    {
        id: 4,
        name: "MSI RTX 2060 VENTUS OC",
        description: "GeForce RTX 2060 VENTUS XS 6G OC.",
        price: 420.0,
        quantity: 0,
        image: "/static/assets/images/msi-rtx-2060.jpg",
    },
    {
        id: 5,
        name: "PALIT GTX 1050",
        description:
            "Turn your PC into a true gaming rig with the fast, powerful GeForce® GTX 1050. It's powered by NVIDIA Pascal™— the most advanced GPU architecture ever created—and features innovative NVIDIA technologies to drive the latest games in their full glory.",
        price: 120.0,
        quantity: 1,
        image: "/static/assets/images/palit-gtx-1050.jpg",
    },
    {
        id: 6,
        name: "Ryzen 5 3600",
        description:
            "The AMD Ryzen 3rd gen processors give you a huge boost in power over the previous generation. You'll get a faster CPU with more memory – perfect for gaming, or just powering through huge work projects and creative tasks.",
        price: 140.0,
        quantity: 0,
        image: "/static/assets/images/ryzen-5-3600.jpg",
    },
]

app.get("/", (req, res) => {
    let context = getContext()
    context["items"] = items
    res.render("templates/index", context)
})

app.get("/search", (req, res) => {
    let search = req.query.search.trim()
    search = search.split(" ").filter((s) => {
        return typeof s === "string" && s !== ""
    })
    res.render("templates/index")
})

app.post("/add-to-cart/:itemID", (req, res) => {
    const itemID = Number(req.params.itemID)
    if (!cart.includes(itemID)) {
        cart.push(itemID)
    } else {
        addError("This item already exists in your cart.")
    }
    res.redirect("/")
})

app.post("/remove-from-cart/:itemID", (req, res) => {
    const itemID = Number(req.params.itemID)
    if (cart.includes(itemID)) {
        cart.splice(
            cart.findIndex((el) => {
                el === itemID
            }),
            1
        )
    }
    res.redirect("/cart")
})

app.get("/cart", (req, res) => {
    const itemsAndTotal = getCartItemsAndTotal()
    let context = getContext(true)
    context["cart"] = itemsAndTotal[0]
    context["total"] = itemsAndTotal[1]
    res.render("templates/cart", context)
})

app.post("/purchase", (req, res) => {
    const itemsAndTotal = getCartItemsAndTotal()
    let order = {
        application_context: {
            brand_name: "mymarketplace",
            locale: "en-GB",
            landing_page: "NO_PREFERENCE",
            shipping_preference: "GET_FROM_FILE",
            user_action: "PAY_NOW",
            return_url: "http://localhost:3000/success",
            cancel_url: "http://localhost:3000/cart",
        },
        intent: "CAPTURE",
        payer: {
            email_address: customer.email,
            name: {
                given_name: customer.first_name,
                surname: customer.last_name,
            },
            address: {
                address_line_1: customer.address_1,
                address_line_2: customer.address_2,
                postal_code: customer.postal_code,
                country_code: "GB",
            },
        },
        purchase_units: [
            {
                amount: {
                    currency_code: "GBP",
                    // Adjust for shipping / tax / discounts here, else the request fails
                    value: String(itemsAndTotal[1] + SHIPPING_PRICE),
                    breakdown: {
                        item_total: {
                            currency_code: "GBP",
                            value: String(itemsAndTotal[1]),
                        },
                        // Flat-rate shipping for across the UK
                        shipping: {
                            currency_code: "GBP",
                            value: String(SHIPPING_PRICE),
                        },
                    },
                    shipping: {
                        name: customer.name,
                        type: "SHIPPING",
                        address: {
                            address_line_1: customer.address_1,
                            address_line_2: customer.address_2,
                            postal_code: customer.postal_code,
                            country_code: "GB",
                        },
                    },
                },
                // Seller information
                payee: {
                    email_address: "mariosyian2@hotmail.com",
                },
                invoice_id: uuid.v4(),
                soft_descriptor: "mymarketplace",
                items: itemsAndTotal[0].map((item) => {
                    if (item.quantity <= 0) {
                        // TODO: Pass list of items which are unavailable by name
                        addError("One or more items in your cart aren't available.")
                        res.redirect("/cart")
                    }
                    return {
                        name: item.name,
                        unit_amount: {
                            currency_code: "GBP",
                            value: String(item.price),
                        },
                        quantity: "1",
                        description:
                            item.description.length > 127
                                ? item.name
                                : item.description,
                    }
                }),
            },
        ],
    }
    axiosRequest("POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders", order, {
        "Content-type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + paypal_access_token,
    })
        .then((response) => {
            const approval_link = response.data.links.filter(
                (link) => link.rel === "approve"
            )[0]
            res.redirect(approval_link.href)
        })
        .catch((error) => {
            console.error(
                "Error while completing purchase: " + error.response.data.details
            )
            res.redirect("/")
        })
})

app.get("/success", (req, res) => {
    // Since the purchase was successful, we can clear the cart
    // and transfer the items to the purchased list.
    const itemsAndTotal = getCartItemsAndTotal()
    updateItemQuantity(itemsAndTotal[0])
    purchased = itemsAndTotal[0].slice()
    cart = []
    let context = getContext(true)
    context["purchased"] = purchased
    res.render("templates/success", context)
})

/********************************************************************/
/** SHOULD INVOICES BE STORED IN THE DB? PROOF OF PURCHASE ARCHIVE **/
/********************************************************************/
app.get("/invoice", (req, res) => {
    let context = getContext(true)
    context["customer"] = customer
    context["purchased"] = purchased
    context["total"] = purchased.reduce((total, item) => {
        return (total += item.price)
    }, 0)
    context["today"] = getToday()
    res.render("templates/invoice", context)
    purchased = []
})

app.listen(port, () => {
    console.log("Server listening on port " + port)
    getAccessToken()
})

/**
 * Push an error into the errors list, if it doesn't already exist.
 *
 * @param {String} err - The error message to include.
 */
function addError(err) {
    if (!errors.includes(err)) {
        errors.push(err)
    }
}

/**
 * Helper function that returns the global context and
 * resets the errors list so they do not persist through webpages.
 *
 * @param resetErrors - Boolean flag to reset the errors list or not.
 * @returns The global context JSON object.
 */
function getContext(resetErrors) {
    let context = {
        errors: errors,
        cart: cart,
    }
    if (resetErrors) {
        context["errors"] = []
    }
    return context
}

/**
 * Helper function to get the items currently in the
 * users cart rather than just their IDs, and the sum of their prices.
 *
 * @returns A list whose first element is a list of items currently in the
 *   users cart, and the second element being the sum of the items prices.
 */
function getCartItemsAndTotal() {
    let cartItems = []
    cart.forEach((id) => {
        // TODO: Pull items via their IDs from db
        cartItems.push(
            items.find((item) => {
                return item.id === id
            })
        )
    })
    const totalPrice = cartItems.reduce((total, item) => {
        return (total += item.price)
    }, 0)

    return [cartItems, totalPrice]
}

/**
 * @returns Today's date in HH:mm:ss DD-MM-YYYY format (UTC)
 */
function getToday() {
    const date = new Date()
    return getTime(date) + " " + getDate(date)
}

/**
 * Extract the hours, minutes and seconds of the current datetime
 *
 * @param {Date} date - Today's datetime
 * @returns The current time in HH:mm:ss format (UTC)
 */
function getTime(date) {
    return (
        String(date.getUTCHours()).padStart(2, "0") +
        ":" +
        String(date.getUTCMinutes()).padStart(2, "0") +
        ":" +
        String(date.getUTCSeconds()).padStart(2, "0")
    )
}

/**
 * Extract the day, months and year of the current datetime
 *
 * @param {Date} date - Todays datetime
 * @returns The current date in DD-MM-YYYY format (UTC)
 */
function getDate(date) {
    return (
        String(date.getDate()).padStart(2, "0") +
        "-" +
        String(date.getMonth()).padStart(2, "0") +
        "-" +
        date.getFullYear()
    )
}

/**
 * Updates the quantity of the items passed after a
 * successful transaction, by subtracting one from their
 * `quantity` property.
 *
 * @param {[Item]} items
 */
function updateItemQuantity(items) {
    items.forEach((item) => {
        // TODO: Get each item ID and update quantity on database
        item.quantity -= 1
    })
}

// Check if access token has expired
setInterval(() => {
    console.log("Retrieving access token...")
    getAccessToken()
}, access_token_interval * 1000)
/**
 * Get a PayPal access token to authenticate API calls.
 */
function getAccessToken() {
    if (paypal_client_id === null || paypal_secret === null) {
        console.error(
            "Authentication with PayPal has failed. Please contact mariosyian2@hotmail.com."
        )
    } else {
        const encoded_auth = base64.encode(paypal_client_id + ":" + paypal_secret)
        axiosRequest(
            "POST",
            "https://api-m.sandbox.paypal.com/v1/oauth2/token",
            "grant_type=client_credentials",
            {
                Accept: "application/json",
                Authorization: "Basic " + encoded_auth,
            }
        )
            .then((response) => {
                paypal_access_token = response.data.access_token
                access_token_interval = response.data.expires_in
                console.log(
                    "Access token received. Expires in " +
                        access_token_interval +
                        " seconds."
                )
            })
            .catch((err) => {
                console.error("Error while fetching PayPal access token:", err)
            })
    }
}

/**
 * Helper function to create and return an axios HTTP request.
 *
 * @param {String} method
 * @param {String} url
 * @param {JSON} data
 * @param {JSON} headers
 * @returns An axios HTTP request promise
 */
const axiosRequest = (method, url, data, headers) => {
    return new Promise((resolve, reject) => {
        axios({
            method: method,
            url: url,
            data: data,
            headers: headers,
        })
            .then((response) => {
                return resolve(response)
            })
            .catch((error) => {
                return reject(error)
            })
    })
}
