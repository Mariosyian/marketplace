const express = require("express")

const port = process.env.port || 3000

const app = express()
app.set("view engine", "ejs")
app.use("/static", express.static(__dirname + "/views/"))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let cart = []
let errors = []
const items = [
    {
        id: 1,
        name: "ASUS RTX 2060",
        description:
            "ASUS Phoenix GeForce RTX™ 2060 6GB GDDR6 with the new NVIDIA Turing™ GPU architecture.",
        price: 420.0,
        image: "/static/assets/images/asus-rtx-2060.jpg",
    },
    {
        id: 2,
        name: "GTX Titan X",
        description:
            "The NVIDIA TITAN X, featuring the NVIDIA Pascal™ architecture, is the ultimate graphics card. Whatever you're doing, this groundbreaking TITAN X gives you the power to accomplish things you never thought possible.",
        price: 500.0,
        image: "/static/assets/images/gtx-titan-x.jpg",
    },
    {
        id: 3,
        name: "MSI GTX 1050",
        description: "GeForce MSI GTX 1050.",
        price: 130.0,
        image: "/static/assets/images/msi-gtx-1050.jpg",
    },
    {
        id: 4,
        name: "MSI RTX 2060 VENTUS OC",
        description: "GeForce RTX 2060 VENTUS XS 6G OC.",
        price: 420.0,
        image: "/static/assets/images/msi-rtx-2060.jpg",
    },
    {
        id: 5,
        name: "PALIT GTX 1050",
        description:
            "Turn your PC into a true gaming rig with the fast, powerful GeForce® GTX 1050. It's powered by NVIDIA Pascal™— the most advanced GPU architecture ever created—and features innovative NVIDIA technologies to drive the latest games in their full glory.",
        price: 120.0,
        image: "/static/assets/images/palit-gtx-1050.jpg",
    },
    {
        id: 6,
        name: "Ryzen 5 3600",
        description:
            "The AMD Ryzen 3rd gen processors give you a huge boost in power over the previous generation. You'll get a faster CPU with more memory – perfect for gaming, or just powering through huge work projects and creative tasks.",
        price: 140.0,
        image: "/static/assets/images/ryzen-5-3600.jpg",
    },
]

// Global context needed for header items which are included in all pages
const globalContext = {
    errors: errors,
    cart: cart,
}

app.get("/", (req, res) => {
    // Copy `globalContext` directly here as we want any errors
    let context = globalContext
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

app.get("/cart", (req, res) => {
    const itemsAndTotal = getCartItemsAndTotal()
    let context = getContext()
    context["cart"] = itemsAndTotal[0]
    context["total"] = itemsAndTotal[1]
    res.render("templates/cart", context)
})

app.get("/success", (req, res) => {
    let context = getContext(true)
    context["cart"] = getCartItemsAndTotal()[0]
    res.render("templates/success", context)
})

app.get("/invoice", (req, res) => {
    const itemsAndTotal = getCartItemsAndTotal()
    const customer = {
        name: "Marios Yiannakou",
        address_1: "Room X, Flat Y",
        address_2: "99 Smith Street",
        address_3: null,
        email: "john@smith.com",
        telephone: "+441234567890",
    }
    let context = getContext(true)
    context["customer"] = customer
    context["cart"] = itemsAndTotal[0]
    context["total"] = itemsAndTotal[1]
    context["today"] = getToday()
    res.render("templates/invoice", context)
})

app.listen(port, () => {
    console.log("Server listening on port " + port)
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
 * @returns The global context JSON object with the errors list reset.
 */
function getContext() {
    let context = globalContext
    context["errors"] = []
    return context
}

/**
 * Helper function to get the items currently in the
 * users cart and the sum of their prices.
 *
 * @returns A list whose first element is a list of the users
 *  items currently in their cart, and the second element being
 *  the sum of the items prices.
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
 * @returns Today's date in HH:MM DD-MM-YYYY format (UTC)
 */
function getToday() {
    const date = new Date()
    return (
        String(date.getUTCHours()).padStart(2, "0") +
        ":" +
        String(date.getUTCMinutes()).padStart(2, "0") +
        " " +
        String(date.getDate()).padStart(2, "0") +
        "-" +
        String(date.getMonth()).padStart(2, "0") +
        "-" +
        date.getFullYear()
    )
}
