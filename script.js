const API_URL = `https://en.wikipedia.org/w/api.php`

function fetchImage(filename, description){
    let output = document.getElementById("output");
    
    window.fetch(`${API_URL}?action=query&titles=${filename}&format=json&prop=imageinfo&iiprop=url&origin=*`)
    .then( response => {
        response.json().then(function(data) {
            let url = data.query.pages['-1'].imageinfo[0].url;
            
            let img = document.createElement("img");
            img.src = url;
            img.title = description
            
            output.appendChild(img);
            
        } );
    } );
}

function generate(){
    let topic = document.getElementById("topic").value;

    let topicDiv = document.getElementById("topic");
    topicDiv.blur()

    let outputDiv = document.getElementById("output");
    outputDiv.innerHTML = ""
    
    window.fetch(`${API_URL}?action=query&format=json&prop=revisions&titles=${topic}&formatversion=2&rvprop=content&rvslots=*&origin=*`)
    .then( response => {
        response.json().then(function(data) {
                console.log("go!")
            let wikiContent = data.query.pages[0].revisions[0].slots.main.content;
            
            // Hack: assume that images are on their own lines.
            let result = wikiContent.matchAll(/(File:.*)(\]\])?\n/g);
            result = [...result];
            result = result.map(x => x[1]);
            for(let imgTag of result){
                let imgTagParts = imgTag.split("|")
                let img = imgTagParts[0]
                let description = imgTagParts[imgTagParts.length-1]
                fetchImage(img, description);
            }
        });
    } );
}

function getSuggestions(value){
    console.log(value);
    window.fetch(`${API_URL}?action=opensearch&format=json&formatversion=2&search=${value}&namespace=0&limit=10&origin=*`)
    .then( response => {
        response.json().then(function(data) {
            let datalist = document.getElementById("suggestions");
            datalist.innerHTML = "";

            for(let item of data[1]){
                addOption(item)
            }
            console.log(data);
        });
    } );
}

function addOption(label){
    let datalist = document.getElementById("suggestions");
    let option = document.createElement("option");

    option.value = `${label}`
    datalist.appendChild(option)
}

window.onload = function() {
    document.getElementById("topic").addEventListener("keyup", (e) => {
        console.log(e)
        if (e.key === "Enter") {
            generate()
        }
    })
}
