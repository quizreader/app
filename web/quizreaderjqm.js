/*
 This file is part of QuizReader.

 QuizReader is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 QuizReader is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with QuizReader.  If not, see <http://www.gnu.org/licenses/>.
 */

var qr = {
	// data access
	dao : null,
	// current language
	language : null,
	// hash of current titles
	current : {},
	// currently selected title
	title : null,
	// section within document
	section : 1,
	// page elements
	chunks : [],
	// words to show definitions
	defWords : [],
	// definitions to show quizzes
	quizzes : [],

	getBaseUrl : function() {
		return "/lib" + this.language + "/";
	},

	getCoverUrl : function() {
		return this.getBaseUrl() + this.title.path + "/cover.html";
	},

	getDefinitionUrl : function(word) {
		var prefix = word.length > 1 ? word.substring(0, 2) : word[0];
		return this.getBaseUrl() + "def/" + prefix + "/" + word + ".json";
	},

	getLibraryUrl : function() {
		return this.getBaseUrl() + "idx.json";
	},

	getPageUrl : function() {
		var name = '' + this.section;
		while (name.length < 3) {
			name = "0" + name;
		}
		return this.getBaseUrl() + this.title.path + "/t" + name + ".html";
	}
};

// Handlebars init
Handlebars.registerHelper("libpath", function() {
	return qr.getBaseUrl();
});

// ---------------------- init methods

function checkDb(callback) {
	if (qr.dao) {
		return callback();
	}
	if (indexeddao.isSupported()) {
		qr.dao = indexeddao;
		qr.dao.open(function() {
			return callback();
		});
	} else {
		alert("Your browser does not support saving data, you can test the app but will not be able to save your progress");
		qr.dao = memorydao;
		return callback();
	}
}

function checkLanguage(callback) {
	if (qr.language) {
		return callback();
	}
	return checkDb(function() {
		qr.dao.getLanguages(function(data) {
			if (data.length > 1) {
				$.mobile.changePage("#language_choice");
			} else if (data.length == 0) { // no existing languages
				$.mobile.changePage("#language_add");
			} else {
				qr.language = data[0].code;
				return callback();
			}
		});
	});
}

function checkTitle(callback) {
	if (qr.title) {
		return callback();
	}
	return checkLanguage(function() {
		$.mobile.changePage("#current");
	});
}

// ---------------------- common methods

function showError(xhr) {
	var source = $("#error_template").html();
	var template = Handlebars.compile(source);
	$("#error_cell").html(template(xhr));
	$.mobile.changePage("#error");
}

function getJSON(url, callback) {
	$.getJSON(url).done(function(data) {
		callback(data);
	}).fail(function(xhr) {
		showError(xhr);
	});
}

function getRoot(data) {
	return data.definitions[0] ? data.definitions[0].root : null;
}

function popupDef(jqelem, data, root) {
	var source = $("#popup_def_template").html();
	var template = Handlebars.compile(source);

	if (root) {
		$("#popup_word1").text(root.word);
		$("#popup_def1").html(template(root));
		$("#popup_word2").text(data.word);
		$("#popup_def2").html(template(data));
	} else {
		$("#popup_word1").text(data.word);
		$("#popup_def1").html(template(data));
		$("#popup_word2").text("");
		$("#popup_def2").html("");
	}

	var pos = jqelem.position();
	$("#popup_def").popup("open", {
		x : pos.left + jqelem.width() / 2,
		y : pos.top + jqelem.height()
	});
}

function showDefinition(jqelem, word) {
	qr.dao.updateWord(word, 1, function() {
		getJSON(qr.getDefinitionUrl(word), function(data) {
			var root = getRoot(data);
			if (root) {
				getJSON(qr.getDefinitionUrl(root), function(rdata) {
					popupDef(jqelem, data, rdata);
				});
			} else {
				popupDef(jqelem, data, null);
			}
		});
	});
}

function loadSection() {

	var sectionWord = {};
	// load document and process elements
	$("#text").load(qr.getPageUrl(), function() {
		// parent elements of <a> definition tags
		var elements = $("h1,h2,h3,h4,span,li", $("#text"));
		var elementsRemaining = elements.length;

		var index = 0;
		elements.each(function(index) {
			// start new chunk object
			var chunk = qr.chunks[index++] = {
				words : [],
				element : this
			};
			// collect unique words
			var elementWord = {};
			$("a", this).each(function() {
				var word = $(this).data("word");
				if (!word) {
					word = $(this).text();
				}
				if (!sectionWord[word]) {
					sectionWord[word] = elementWord[word] = true;
				}
				// add link
				$(this).click(function(evt) {
					showDefinition($(this), word);
					evt.preventDefault();
				});
			});
			// lookup collected words
			var remaining = Object.keys(elementWord).length;
			if (!remaining && !--elementsRemaining) {
				quizRead();
			}
			for (lookupWord in elementWord) {
				qr.dao.getWord(lookupWord, function(word, count) {
					if (!count) {
						chunk.words.push(word);
					}
					if (!--remaining && !--elementsRemaining) {
						quizRead();
					}
				});
			}
		});
	});
}

function quizRead() {
	while (qr.defWords.length < 3) {
		if (!qr.chunks.length) {
			qr.section++;
			return loadSection();
		}
		var chunk = qr.chunks.shift();
		$(chunk.element).show();
		qr.defWords = qr.defWords.concat(chunk.words);
	}
	$.mobile.changePage("#show_def");
}

// ---------------------- language add

$(document).delegate("#language_add", "pageinit", function() {
	var source = $("#add_language_template").html();
	var template = Handlebars.compile(source);
	$(document).on('pagebeforeshow', '#language_add', function(e, data) {
		checkDb(function() {
			var languages = [ {
				code : "es",
				name : "Spanish"
			}, {
				code : "fr",
				name : "French"
			}, {
				code : "de",
				name : "German"
			} ];
			qr.dao.getLanguages(function(data) {
				// turn list into hash of new languages
				var languageHash = {};
				for (var i = 0; i < languages.length; i++) {
					var code = languages[i].code;
					languageHash[code] = languages[i];
					for (var j = 0; j < data.length; j++) {
						if (code == data[j].code) {
							languages[i].inuse = true;
						}
					}
				}
				var list = $("#add_language_list");
				console.log(languages);
				list.html(template(languages)).listview("refresh");
				$("a[data-code]", list).on('click', function(e) {
					qr.language = $(this).data("code");
					qr.dao.addLanguage({
						code : qr.language,
						name : languageHash[qr.language],
						words : 0
					}, function() {
						$.mobile.changePage("#current");
					});
				});
			});
		});
	});
});

// ---------------------- language choice

$(document).delegate("#language_choice", "pageinit", function() {
	var source = $("#language_template").html();
	var template = Handlebars.compile(source);

	$(document).on('pagebeforeshow', '#language_choice', function(e, data) {
		checkLanguage(function() {
			var list = $("#language_list");
			list.html(template(qr.languages)).listview("refresh");
			$("a[data-code]", list).on('click', function(e) {
				qr.language = $(this).data("code");
				$.mobile.changePage("#current");
			});
		});
	});
});

// ---------------------- current/now reading

$(document).delegate("#current", "pagebeforecreate", function() {
	var source = $("#current_template").html();
	var template = Handlebars.compile(source);

	$(document).on('pagebeforeshow', '#current', function(e, data) {
		checkLanguage(function() {
			qr.current = {};
			qr.dao.getOpenTitles(function(data) {
				// hash current titles
				for (var i = 0; i < data.length; i++) {
					qr.current[data[i].path] = data[i];
				}
				var list = $("#current_list");
				list.html(template(data)).listview("refresh");
				$("a[data-path]", list).on('click', function(e) {
					qr.title = qr.current[$(this).data("path")];
					$.mobile.changePage("#details");
				});
			});
		});
	});
});

// ---------------------- library

$(document).delegate("#library", "pageinit", function() {
	var source = $("#library_template").html();
	var template = Handlebars.compile(source);

	// library state
	var lib = {
		language : null,
		current : null,
		prepare : function(data) {
			for (var i = 0; i < data.length; i++) {
				if (data[i].name) {
					data[i].sub = data[i].sub ? data[i].sub : [];
					data[i].sub.parent = data;
					this.prepare(data[i].sub);
				}
			}
		}
	};

	function showEntry() {
		var list = $("#library_list");
		// redo list from template
		list.html(template({
			lib : lib.current,
			libpath : qr.getBaseUrl()
		})).listview("refresh");
		// hash titles
		var titleByPath = {};
		for (var i = 0; i < lib.current.length; i++) {
			if (lib.current[i].title) {
				titleByPath[lib.current[i].path] = lib.current[i];
			}
		}
		// add event handlers to new list items
		$("a[data-path]", list).on('click', function(e) {
			qr.title = titleByPath[$(this).data("path")];
			console.log("title hash for " + $(this).data("path"));
			console.log(qr.title);
			$.mobile.changePage("#details");
		});
		$("a[data-parent]", list).on('click', function(e) {
			lib.current = lib.current.parent;
			showEntry();
		});
		$("a[data-index]", list).on('click', function(e) {
			var index = $(this).data("index");
			lib.current = lib.current[index].sub;
			showEntry();
		});
	}

	$(document).on('pagebeforeshow', '#library', function(e, data) {
		checkLanguage(function() {
			if (lib.language != qr.language) {
				// $.mobile.loading("show", {
				// text : "loading library for " + qr.language,
				// textVisible : true
				// });
				$.getJSON(qr.getLibraryUrl()).done(function(data) {
					lib.language = qr.language;
					lib.current = data;
					lib.prepare(data);
					showEntry();
				}).fail(function(foo, mesg) {
					alert(mesg);
					console.log(foo);
				});
			}
		});
	});
});

// ------------------- details

$(document).delegate("#details", "pageinit", function() {
	$("#readButton").on('click', function(e) {
		// are we already reading this title
		if (!qr.current[qr.title.path]) {
			qr.dao.addTitle(qr.title);
		}
		// read
		loadSection();
	});

	$(document).on('pagebeforeshow', '#details', function(e, data) {
		checkTitle(function() {
			$("#cover_div").load(qr.getCoverUrl());
		});
	});
});

// ------------------- reading page

$(document).delegate("#read", "pageinit", function() {

	$("#moreButton").on('click', function(e) {
		quizRead();
	});

	$(document).on('pagebeforeshow', '#read', function(e, data) {
		checkTitle(function() {
			//
		});
	});
});

// ------------------- definition page

$(document).delegate("#show_def", "pageinit", function() {

	var source = $("#def_template").html();
	var template = Handlebars.compile(source);

	function showDefinition(data) {
		// update in dao
		qr.dao.updateWord(data.word, 1, function() {
			$("#def_div").html(template(data));
			qr.quizzes.push(data);
		});
	}

	function nextDefinition() {
		if (qr.defWords.length) {
			var word = qr.defWords.shift();
			getJSON(qr.getDefinitionUrl(word), function(data) {
				// check for root
				var root = getRoot(data);
				if (root) {
					// lookup root to see if known
					qr.dao.getWord(root, function(root, count) {
						if (!count) { // show root def if unknown
							getJSON(qr.getDefinitionUrl(root), function(data) {
								qr.defWords.unshift(word);
								showDefinition(data);
							});
						} else {
							showDefinition(data);
						}
					});
				} else {
					showDefinition(data);
				}
			});
		} else { // we're out of definitions to show
			if (qr.quizzes.length) {
				$.mobile.changePage("#quiz");
			} else { // we're done showing quizzes
				$.mobile.changePage("#read");
			}
		}
	}

	// "Next" button
	$("#nextDefButton").on('click', function(e) {
		nextDefinition();

	});

	$(document).on('pagebeforeshow', '#show_def', function(e, data) {
		checkTitle(function() {
			nextDefinition();
		});
	});
});

// ------------------- quiz page

$(document).delegate("#quiz", "pageinit", function() {

	var correctOption;

	function labelFor(input) {
		return $("label[for='" + input + "']");
	}

	function nextLabel() {
		for (var i = 1; i <= 3; i++) {
			var label = labelFor("answer" + i);
			if (label.text().length == 0) {
				return label;
			}
		}
	}

	function showQuiz() {
		// get next entry
		while (qr.quizzes.length) {
			var entry = qr.quizzes.pop();
			if (entry.definitions[0]) {
				// clear quiz form
				$("label").text("");
				$("label").removeClass("correct").removeClass("incorrect");
				$("input:radio").removeAttr('checked');
				$("input:radio").checkboxradio('refresh');
				$("input:radio").checkboxradio('enable');
				$("#quiz_def").text(entry.definitions[0].text);
				$("#nextQuizButton").button('disable');
				// add new quiz
				var roll = Math.floor(Math.random() * 3) + 1;
				correctOption = "answer" + roll;
				labelFor(correctOption).text(entry.word);
				nextLabel().text("wrong ans1");
				nextLabel().text("wrong ans2");
				return;
			}
		}
		// out of quizzes, close dialog
		$.mobile.changePage("#read");
	}

	// radio button click handler
	$("input:radio").click(function(e) {
		// disable form and enable next button
		$("input:radio").checkboxradio('disable')
		$("#nextQuizButton").button('enable');
		// style the correct answer
		labelFor(correctOption).addClass("correct");
		if (this.id != correctOption) {
			// style bad answer incorrect
			labelFor(this.id).addClass("incorrect");
			// reshuffle
			qr.quizzes.sort(function(a, b) {
				return Math.random() > 0.5 ? -1 : 1;
			});
		} else {
			// update word level
			qr.dao.updateWord(labelFor(this.id).text(), 2, function() {
				// auto-increment to next quiz
				var countdown = 3;
				(function timer() {
					// show countdown in button
					$("#nextQuizButton").val("Next (" + countdown + ")");
					// end or continue count
					if (countdown-- == 0) {
						$("#nextQuizButton").val("Next");
						showQuiz();
					} else {
						setTimeout(timer, 1000);
					}
					$("#nextQuizButton").button("refresh");
				}());
			});
		}
	});

	// "Next" button
	$("#nextQuizButton").on('click', function(e) {
		showQuiz();
	});

	$(document).on('pagebeforeshow', '#quiz', function(e, data) {
		checkTitle(function() {
			showQuiz();
		});
	});
});
